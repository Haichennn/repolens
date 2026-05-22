from fastapi import FastAPI

app = FastAPI(title="Repolens")


@app.get("/health")
def health():
    return {"status": "ok", "service": "repolens"}
