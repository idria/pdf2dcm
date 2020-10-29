# pdf2dcm

## Quickstart

1. Instalar Node.js https://nodejs.org/es/download/
2. (Windows Server) Descargar Visual C++ Redistributable 2015
3. npm install
4. npm start

## Servicio de Windows

- node install-windows-service
- node remove-windows-service

## Configuracion

index.js

- const WEB_PORT = 5000; (Puerto de escucha del servidor WEB)
- const DICOM_PORT = 4242; (Puerto PACS)
- const DICOM_HOST = "127.0.0.1"; (IP PACS)
- const SEARCH_TIMEOUT = 5000; (Timeout de busqueda de archivos a procesar en ms.)
- const CLEANUP_TIMEOUT = 10; (Timeout de borrado de archivos en carpeta Error y Backup)
- const CLEANUP_FILE_AGE = 5; (Antiguedad de archivos en carpeta Error y Backup)

## Test (Postman)

- Method: POST
- URL: http://127.0.0.1:5000/convert
- Body: /tests/body.json (raw)

## API v1

- /api/ping

- /api/v1/convert

```
{
    "DICOM": {
        "PatientName": "PATIENT^NAME",
        "PatientID": 2020202,
        "AccessionNumber": "PRUEBAX",
        "PatientBirthDate": "19861126",		// YYYYMMDD
        "patientSex": "M",					// M, F, O
        "StudyID": "A2020"
    },
    "PDF": "<BASE64>"
}
```

- /api/v1/status/:id

```
{
	"pdf": BOOL,
	"pre": BOOL,
	"dcm": BOOL,
	"err": BOOL,
	"ok": BOOL,
}
```