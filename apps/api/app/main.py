"""
REZEA API - Backend FastAPI avec Multi-tenancy
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import structlog

from app.core.config import settings
from app.core.security import verify_token
from app.db.session import engine, Base, AsyncSessionLocal
from app.models.models import User, UserRole, Order, Offer, Booking, BookingStatus, OrderPaymentStatus, Installment, Tenant
from app.api import auth, users, tenants, bookings, credits, planning, events

# Configuration du logger structuré
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestion du cycle de vie de l'application"""
    logger.info("🚀 Démarrage de REZEA API")
    
    # Création des tables (en dev, en prod on utilise Alembic)
    if settings.ENVIRONMENT == "development":
        print(f"DEBUG: SECRET_KEY='{settings.SECRET_KEY}'")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    
    # Lancement des tâches de fond
    import asyncio
    from app.services.tasks import run_background_tasks
    asyncio.create_task(run_background_tasks())
    
    yield
    
    logger.info("🛑 Arrêt de REZEA API")
    await engine.dispose()


# Initialisation FastAPI
app = FastAPI(
    title="REZEA API",
    description="SaaS Multi-tenant pour Établissements Sportifs",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
)

@app.middleware("http")
async def inject_tenant_context(request: Request, call_next):
    """
    Middleware Multi-tenant: Injecte le tenant_id dans le contexte
    de la requête pour Row-Level Security et filtrage.
    """
    # 0. Initialisation SYSTEMATIQUE du state pour éviter AttributeError
    request.state.tenant_id = None
    request.state.user_id = None

    if request.method == "OPTIONS":
        return await call_next(request)
    
    path = request.url.path
    headers = request.headers
    logger.info("Middleware: Incoming request", 
                method=request.method, 
                path=path, 
                origin=headers.get("Origin"),
                tenant_slug=headers.get("X-Tenant-Slug"),
                has_auth=bool(headers.get("Authorization")))
    # DEBUG - Print headers to see what's actually received
    print(f"DEBUG MIDI: path={path} auth={headers.get('Authorization')} slug={headers.get('X-Tenant-Slug')}")
    
    # 1. Tentative de récupération via Token JWT (Privé)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            token = auth_header.split(" ")[1]
            payload = verify_token(token)
            if payload:
                from uuid import UUID
                t_id = payload.get("tenant_id")
                u_id = payload.get("sub")
                if t_id:
                    request.state.tenant_id = UUID(str(t_id))
                if u_id:
                    request.state.user_id = UUID(str(u_id))
                logger.debug("Middleware: Auth token valid", user_id=str(request.state.user_id), tenant_id=str(request.state.tenant_id))
                # DEBUG
                print(f"DEBUG MIDI: SUCCESS! tenant={request.state.tenant_id} user={request.state.user_id}")
        except Exception as e:
            logger.warning("Échec auth token dans middleware", error=str(e))
            # DEBUG
            print(f"DEBUG MIDI: FAILED verify_token: {str(e)}")

    # 2. Tentative de récupération via Header X-Tenant-Slug (Public ou Fallback)
    if not request.state.tenant_id:
        tenant_slug = request.headers.get("X-Tenant-Slug")
        if tenant_slug:
            try:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(Tenant.id).where(Tenant.slug == tenant_slug))
                    t_id = result.scalar_one_or_none()
                    if t_id:
                        request.state.tenant_id = t_id
                        logger.debug("Middleware: Resolved tenant from slug", slug=tenant_slug, tenant_id=str(t_id))
            except Exception as e:
                logger.error("Erreur lors de la résolution du tenant par slug", error=str(e))

    # DEBUG - Résumé du contexte résolu
    if not request.state.tenant_id:
        logger.warning("Middleware resolution failed", 
                       has_auth=bool(auth_header), 
                       has_slug=bool(headers.get("X-Tenant-Slug")),
                       path=path)

    # 3. Détermination du type de route
    public_paths = [
        "/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", 
        "/api/auth/reset-password", "/health", "/docs", "/openapi.json", 
        "/api/sysadmin/login"
    ]
    
    is_public = (
        path in public_paths or 
        path.startswith("/api/webhooks") or 
        path.startswith("/uploads") or
        path.startswith("/api/tenants/by-slug/") or
        path == "/api/tenants/search" or
        path == "/api/offers" or # List is public
        path == "/api/auth/login"
    )
    is_sysadmin = path.startswith("/api/sysadmin")

    # 4. Blocage si contexte manquant
    is_global_public = path in ["/health", "/docs", "/openapi.json"] or path.startswith("/api/sysadmin")
    
    if not is_global_public:
        if not request.state.tenant_id and not is_public:
            logger.warning("Middleware block: Missing tenant_id", path=path)
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Identification de l'établissement requise (Flux ou Token manquant)"}
            )
        
        # Pour les routes privées, on exige user_id
        if not is_public and not request.state.user_id:
            logger.warning("Middleware block: Missing user_id", path=path)
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Session expirée ou invalide"}
            )

    # 5. Appel de la suite
    response = await call_next(request)
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handler global des exceptions"""
    logger.error(
        "Exception non gérée",
        path=request.url.path,
        method=request.method,
        error=str(exc)
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Erreur interne du serveur"}
    )


# Routes
@app.get("/health")
async def health_check():
    """
    Health check pour monitoring.
    Vérifie que l'API est active ET que la base de données est accessible.
    Coût : ~1ms (un simple SELECT 1).
    """
    db_status = "healthy"
    try:
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "degraded",
                "version": "1.0.0",
                "environment": settings.ENVIRONMENT,
                "database": db_status
            }
        )
    
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "database": db_status
    }


# Inclusion des routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(tenants.router, prefix="/api/tenants", tags=["Tenants"])
app.include_router(bookings.router, prefix="/api/bookings", tags=["Bookings"])
app.include_router(credits.router, prefix="/api/credits", tags=["Credits"])
app.include_router(planning.router, prefix="/api/planning", tags=["Planning"])
app.include_router(events.router, prefix="/api/events", tags=["Events"])

# Offers & Shop
from app.api import offers, shop
app.include_router(offers.router, prefix="/api/offers", tags=["Offers"])
app.include_router(shop.router, prefix="/api/shop", tags=["Shop"])

# Sysadmin (hors-tenant)
from app.api import sysadmin
app.include_router(sysadmin.router, prefix="/api/sysadmin", tags=["SysAdmin"])

# Uploads (bannières, etc.)
from app.api import uploads
app.include_router(uploads.router, prefix="/api/uploads", tags=["Uploads"])

# Webhooks (pas de middleware tenant pour les webhooks externes)
from app.api import webhooks
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])

# Admin Users
from app.api import admin_users
app.include_router(admin_users.router, prefix="/api/admin/users", tags=["Admin Users"])

# Admin Events
from app.api import admin_events
app.include_router(admin_events.router, prefix="/api/admin/events", tags=["Admin Events"])

# Admin Agenda
from app.api import admin_agenda
app.include_router(admin_agenda.router, prefix="/api/admin/agenda", tags=["Admin Agenda"])

# Admin Orders
from app.api import admin_orders
app.include_router(admin_orders.router, prefix="/api/admin/orders", tags=["Admin Orders"])

# Admin Bookings
from app.api import admin_bookings
app.include_router(admin_bookings.router, prefix="/api/admin/bookings", tags=["Admin Bookings"])

# Admin Event Registrations
from app.api import admin_event_registrations
app.include_router(admin_event_registrations.router, prefix="/api/admin/event-registrations", tags=["Admin Event Registrations"])

# Admin Emails
from app.api import admin_emails
app.include_router(admin_emails.router, prefix="/api/admin/emails", tags=["Admin Emails"])

# Servir les fichiers uploadés
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# CORSMiddleware added last to be outermost
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development"
    )
