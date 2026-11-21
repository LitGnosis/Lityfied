FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker/ ./worker/
ENV PYTHONUNBUFFERED=1 LITYFIED_DATA_DIR=/data
EXPOSE 10000
CMD ["sh","-c","exec uvicorn worker.service:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
