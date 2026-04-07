// Cloudflare Worker — CORS proxy for Airbnb iCal
// Deploy at: https://workers.cloudflare.com

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

    // Only allow Airbnb iCal URLs
    if (!target.startsWith('https://www.airbnb.es/calendar/ical/') &&
        !target.startsWith('https://www.airbnb.com/calendar/ical/')) {
      return new Response('Forbidden', { status: 403 });
    }

    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CalendarReader/1.0)',
        'Accept': 'text/calendar, */*'
      }
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      }
    });
  }
};
