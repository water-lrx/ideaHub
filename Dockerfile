FROM python:3.12-alpine

WORKDIR /app

COPY index.html styles.css app.js server.py README.md manifest.webmanifest sw.js ./
COPY icons ./icons
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=5173

EXPOSE 5173

CMD ["python", "server.py"]
