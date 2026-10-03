from django.conf import settings
from django.http import Http404, HttpResponse
from django.shortcuts import render


def api_root(request):
    return render(request, 'index.html')


def service_worker(request):
    """Serve the push service worker from the site root so it can control the whole app."""
    sw_path = settings.BASE_DIR.parent / 'frontend' / 'dist' / 'sw.js'
    if not sw_path.exists():
        raise Http404('sw.js not built - run "npm run build" in frontend/')
    response = HttpResponse(sw_path.read_text(encoding='utf-8'), content_type='application/javascript')
    response['Service-Worker-Allowed'] = '/'
    response['Cache-Control'] = 'no-cache'
    return response
