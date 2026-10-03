"""
URL configuration for finovaai project.
"""
from django.contrib import admin
from django.urls import path, include
from .views import api_root, service_worker

urlpatterns = [
    path('', api_root, name='api_root'),
    path('sw.js', service_worker, name='service_worker'),
    path('admin/', admin.site.urls),
    path('api/', include('accounts.urls')),
]
