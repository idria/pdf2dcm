# pdf2dcm

## Quickstart

1. Instalar Node.js https://nodejs.org/es/download/
2. npm install
3. npm start

## Configuracion

index.js

const WEB_PORT = 5000;
const DICOM_PORT = 4242;
const DICOM_HOST = "127.0.0.1";

## Test (Postman)

Method: POST
URL: http://127.0.0.1:5000/convert
Body: /tests/body.json (raw)