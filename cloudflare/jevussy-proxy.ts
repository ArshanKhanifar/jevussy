const CLOUD_RUN_ORIGIN = 'https://jev-piano-ile3dut2kq-nn.a.run.app';

const proxy = {
  async fetch(request: Request): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, CLOUD_RUN_ORIGIN);
    const headers = new Headers(request.headers);

    headers.set('x-forwarded-host', incomingUrl.host);
    headers.set('x-forwarded-proto', 'https');

    const upstreamResponse = await fetch(new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    }));

    const responseHeaders = new Headers(upstreamResponse.headers);
    const location = responseHeaders.get('location');
    if (location?.startsWith(CLOUD_RUN_ORIGIN)) {
      responseHeaders.set('location', location.replace(CLOUD_RUN_ORIGIN, incomingUrl.origin));
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};

export default proxy;
