import urllib.request, urllib.error

class NoRedirect(urllib.request.HTTPErrorProcessor):
    def http_response(self, request, response):
        return response
    https_response = http_response

opener = urllib.request.build_opener(NoRedirect)

for start_url in ["https://www.pitzbol.me/login", "https://www.pitzbol.me/"]:
    print(f"\n--- {start_url} ---")
    url = start_url
    for i in range(6):
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            resp = opener.open(req, timeout=10)
            loc = resp.headers.get("Location", "")
            print(f"  Step {i}: HTTP {resp.status} <- {url}")
            print(f"           Location: {loc if loc else '(none)'}")
            if not loc or loc == url:
                break
            url = loc
        except Exception as e:
            print(f"  Error: {e}")
            break
