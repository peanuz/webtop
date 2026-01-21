
export class ProxyService {
  /**
   * Fetches a URL and streams it back with rewritten HTML and stripped security headers
   */
  async fetchAndRewrite(targetUrl: string, headers: HeadersInit = {}): Promise<Response> {
    try {
      // 1. Fetch the target
      // We pass through the user agent to avoid looking like a bot/curl
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": (headers as any)["user-agent"] || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        },
        redirect: "follow"
      });

      // 2. Prepare new headers
      const newHeaders = new Headers(response.headers);
      
      // Remove blocking headers
      newHeaders.delete("x-frame-options");
      newHeaders.delete("content-security-policy");
      newHeaders.delete("content-security-policy-report-only");
      newHeaders.delete("x-content-type-options");
      
      // Allow embedding
      newHeaders.set("Access-Control-Allow-Origin", "*");

      // 3. Check if it's HTML. If not, just pipe it (images, css, etc.)
      const contentType = newHeaders.get("content-type");
      if (!contentType || !contentType.includes("text/html")) {
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders
        });
      }

      // 4. Use HTMLRewriter for HTML content to inject <base> tag and navigation script
      // This ensures all relative links (css, js, images) resolve against the original URL
      // And the script ensures clicks stay within the proxy
      const rewriter = new HTMLRewriter()
        .on("head", {
          element(el) {
            el.append(`<base href="${response.url}">`, { html: true });
            el.append(`
              <script>
                document.addEventListener('click', e => {
                  const a = e.target.closest('a');
                  if (a && a.href && !a.href.startsWith('javascript:') && !a.href.includes('/api/v1/proxy')) {
                    e.preventDefault();
                    window.location.href = '/api/v1/proxy?url=' + encodeURIComponent(a.href);
                  }
                });
                document.addEventListener('submit', e => {
                  const form = e.target;
                  if (form.action) {
                    e.preventDefault();
                    const url = new URL(form.action);
                    // This is a naive form handler, implies GET. POST requires more work.
                    // For a basic viewer, we just reload via proxy if possible.
                    if (form.method.toLowerCase() === 'get') {
                        const params = new URLSearchParams(new FormData(form));
                        url.search = params.toString();
                        window.location.href = '/api/v1/proxy?url=' + encodeURIComponent(url.toString());
                    }
                  }
                });
              </script>
            `, { html: true });
          }
        });

      // Transform the response body
      const transformed = rewriter.transform(response);
      
      return new Response(transformed.body, {
        status: response.status,
        headers: newHeaders
      });

    } catch (e: any) {
      console.error("[ProxyService] Error:", e);
      return new Response(`Error fetching URL: ${e.message}`, { status: 500 });
    }
  }
}

export const proxyService = new ProxyService();

