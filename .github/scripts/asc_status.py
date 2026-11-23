"""État de Qafila sur App Store Connect (lecture seule) : versions, soumissions de vérification, derniers builds."""
import os, time, json, urllib.request
import jwt

APP = "6836232597"
key = open(os.environ["ASC_KEY_PATH"]).read()
tok = jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": int(time.time()), "exp": int(time.time()) + 1100, "aud": "appstoreconnect-v1"},
                 key, algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})

def get(path):
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, headers={"Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req) as r:
        return json.load(r)

for v in get(f"/v1/apps/{APP}/appStoreVersions?limit=10")["data"]:
    a = v["attributes"]
    print("VERSION", a["versionString"], a.get("appStoreState"), a.get("appVersionState"), v["id"])
for s in get(f"/v1/reviewSubmissions?filter[app]={APP}&limit=10")["data"]:
    a = s["attributes"]
    print("REVIEW", s["id"], a.get("state"), a.get("submittedDate"))
for b in get(f"/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=5")["data"]:
    a = b["attributes"]
    print("BUILD", a["version"], a.get("processingState"), a.get("uploadedDate"), b["id"])
