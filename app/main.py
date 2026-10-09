from fastapi import FastAPI

app = FastAPI(title="SecureTask")


@app.get("/health")
def health():
    return {"status": "ok"}
