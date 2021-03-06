///////////////////////////////////
const WEB_PORT = 5000;
const DICOM_PORT = 4242;
const DICOM_HOST = "127.0.0.1";
///////////////////////////////////
const SEARCH_TIMEOUT = 5000;
const CLEANUP_TIMEOUT = 50000;
const CLEANUP_FILE_AGE = 5;
///////////////////////////////////

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const async = require('async');
const execFile = require('child_process').execFile;
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { createLogger, format, transports } = require('winston');
const { json } = require('express');
const { combine, timestamp, label, printf } = format;

const tmp = path.join(__dirname, 'tmp');
const backup = path.join(__dirname, 'backup');
const error = path.join(__dirname, 'error');

const app = express();

const myFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    myFormat
  ),
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
	    filename: './logs/application-%DATE%.log',
	    datePattern: 'YYYY-MM-DD-HH',
	    zippedArchive: true,
	    maxSize: '20m',
	    maxFiles: '14d'
 	})
  ],
});

if (!fs.existsSync(tmp)){
    fs.mkdirSync(tmp);
	logger.log('info', 'Se creo la carpeta tmp.');
}

if (!fs.existsSync(backup)){
    fs.mkdirSync(backup);
	logger.log('info', 'Se creo la carpeta backup.');
}

if (!fs.existsSync(error)){
    fs.mkdirSync(error);
	logger.log('info', 'Se creo la carpeta tmp.');
}

// delete all files from a folder
const removeDir = function(path) {
	if (fs.existsSync(path)) {
		const files = fs.readdirSync(path);
  
		if (files.length > 0) {
			files.forEach(function(filename) {
				if (fs.statSync(path + "/" + filename).isDirectory()) {
					removeDir(path + "/" + filename)
				} else {
					fs.unlinkSync(path + "/" + filename)
				}
			})
		} else {
			logger.log('info', 'removeDir: Sin archivos en el directorio.');
		}
	} else {
		logger.log('error', 'removeDir: No existe el directorio.');
	}
}

logger.log('info', 'Borrando archivos temporales..');
removeDir(tmp);

// Convierte PDF a .pre (DICOM sin tags de identificacion)
function PDF(files, pdf_cb) {
	try {
		let pdfs = files.filter(fileName => fileName.substr(fileName.lastIndexOf('.') + 1) === 'pdf' );

		async.eachSeries(pdfs, function(item, pdf_item_cb) {
			let inputFile = path.join(tmp, item);
			let errorFile = path.join(error, item);
			let outputFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".pre");
			let jsonFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".json");

			logger.log('info', 'PDF2DCM Convirtiendo.. ('+inputFile+')');

			execFile(
				path.join(__dirname, 'dcmtk', 'pdf2dcm.exe'), 
				[inputFile, outputFile], 
				function(err, data) {
					if(err === null) {
						fs.unlink(inputFile, function(err) {
							if(err) logger.log('error', 'Unlink #1:' + err);
							pdf_item_cb(null);
						});
						logger.log('info', 'PDF2DCM OK. ('+inputFile+')');
					}else{
						logger.log('error', 'Error al ejecutar pdf2dcm.exe. '+data);
						// si archivo invalido lo muevo a err
						async.parallel([
							function(callback1) {
								logger.log('info', 'Moviendo archivo a error: '+inputFile);
								fs.rename(inputFile, errorFile, function(err) {
									if(err) logger.log('error', 'Unlink #2:' + err);
									callback1(null);
								});
							},
							function(callback2) {
								logger.log('error', 'Borrando archivo: '+jsonFile);
								fs.unlink(jsonFile, function(err) {
									if(err) logger.log('error', 'Unlink #3:' + err);
									callback2(null);
								});
							}
						], function(err, results) {
							pdf_item_cb(null);
						});
					}
				}
			);
		}, function done() {
			pdf_cb(null);
		});
	} catch (err) {
		logger.log('error', 'TryCatch PDF:' + err);
	}
}

// Convierte .pre a .dcm (DICOM con identificacion)
function PRE(files, pre_cb) {
	try {
		let pre = files.filter(fileName => fileName.substr(fileName.lastIndexOf('.') + 1) === 'pre' );

		async.eachSeries(pre, function(item, pre_item_cb) {
			let inputFile = path.join(tmp, item);
			let errorFile = path.join(error, item);
			let outputFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".dcm");
			let jsonFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".json");

			// lee archivo JSON con datos DICOM
			fs.readFile(jsonFile, function(err, rawJsonData) {
				let accessionNumberTag;
				let patientNameTag;
				let patientIDTag;
				let patientBirthDateTag;
				let patientSexTag;
				let studyIDTag;
				let studyDateTag;
				let studyDescription;
				let documentTitle;

				let dicomTags = [];

				if(err) {
					logger.log('error', 'PRE readfile' + err);
					pre_item_cb(null);
				}

				let jsonData = JSON.parse(rawJsonData);

				if(jsonData.AccessionNumber !== undefined) {
					accessionNumberTag = jsonData.AccessionNumber;
					dicomTags.push('-i');
					dicomTags.push("(0008,0050)="+accessionNumberTag);
				}

				if(jsonData.PatientName !== undefined) {
					patientNameTag = jsonData.PatientName;
					dicomTags.push('-i');
					dicomTags.push("(0010,0010)="+patientNameTag);
				}

				if(jsonData.PatientID !== undefined) {
					patientIDTag = jsonData.PatientID;
					dicomTags.push('-i');
					dicomTags.push("(0010,0020)="+patientIDTag);
				}

				if(jsonData.PatientBirthDate !== undefined) {
					patientBirthDateTag = jsonData.PatientBirthDate;
					dicomTags.push('-i');
					dicomTags.push("(0010,0030)="+patientBirthDateTag);
				}

				if(jsonData.PatientSex !== undefined) {
					patientSexTag = jsonData.PatientSex;
					dicomTags.push('-i');
					dicomTags.push("(0010,0040)="+patientSexTag);
				}

				if(jsonData.StudyID !== undefined) {
					studyIDTag = jsonData.StudyID;
					dicomTags.push('-i');
					dicomTags.push("(0020,0010)="+studyIDTag);
				}

				if(jsonData.StudyDate !== undefined) {
					studyDateTag = jsonData.StudyDate;
					dicomTags.push('-i');
					dicomTags.push("(0008,0020)="+studyDateTag);
				}

				if(jsonData.StudyDescription !== undefined) {
					studyDescription = jsonData.StudyDescription;
					dicomTags.push('-i');
					dicomTags.push("(0008,1030)="+studyDescription);
				}

				if(jsonData.DocumentTitle !== undefined) {
					documentTitle = jsonData.DocumentTitle;
					dicomTags.push('-i');
					dicomTags.push("(0042,0010)="+documentTitle);
				}

				dicomTags.push(inputFile);

				logger.log('info', 'DCMODIFY Convirtiendo.. ('+inputFile+')');

				execFile(
					path.join(__dirname, 'dcmtk', 'dcmodify.exe'), dicomTags, 
					function(err, data) {
						if(err === null) {
							fs.rename(inputFile, outputFile, function(err) {
								if(err === null) {
									pre_item_cb(null);
								}else{
									logger.log('error', 'Error al mover archivo: '+inputFile);
									pre_item_cb(null);
								}
							});

							logger.log('info', 'DCMODIFY OK. ('+inputFile+')');
						}else{
							logger.log('error', 'Error al ejecutar dcmodify.exe. '+data);
							// si archivo invalido lo muevo a err
							async.parallel([
								function(callback1) {
									logger.log('error', 'Moviendo archivo a error: '+inputFile);
									fs.rename(inputFile, errorFile, function(err) {
										if(err) logger.log('error', 'Rename #1:' + err);
										callback1(null);
									});
								},
								function(callback2) {
									logger.log('error', 'Borrando archivo: '+jsonFile);
									fs.unlink(jsonFile, function(err) {
										if(err) logger.log('error', 'Unlink #4:' + err);
										callback2(null);
									});
								}
							], function(err, results) {
								pre_item_cb(null);
							});
						}
					}
				);
			});
		}, function done() {
			pre_cb(null);
		});
	} catch (err) {
		logger.log('error', 'Try Catch:' + err);
	}
}

// Envia .dcm a servidor DICOM
function DCM(files, dcm_cb) {
	try {
		let dcm = files.filter(fileName => fileName.substr(fileName.lastIndexOf('.') + 1 ) === 'dcm' );

		async.eachSeries(dcm, function(item, dcm_item_cb) {
			let inputFile = path.join(tmp, item);
			let backupFile = path.join(backup, item);
	
			let preBakFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".pre.bak");
			let jsonFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".json");
	
			logger.log('info', 'DCMSEND Enviando.. ('+inputFile+')');
	
			execFile(
				path.join(__dirname, 'dcmtk', 'dcmsend.exe'), 
				[DICOM_HOST, DICOM_PORT, inputFile], 
				(err, stdout, stderr) => {
					if(err === null) {
						// mueve .dcm a carpeta backup
						fs.rename(inputFile, backupFile, function(err) {
							if(err === null) {
								// borro .bak.pre y .json
								async.parallel([
									function(callback1) {
										fs.unlink(preBakFile, function(err) {
											if(err) logger.log('error', 'Unlink #5:' + err);
											callback1(null);
										});
									},
									function(callback2) {
										fs.unlink(jsonFile, function(err) {
											if(err) logger.log('error', 'Unlink #6:' + err);
											callback2(null);
										});
									}
								], function(err, results) {
									dcm_item_cb(null);
								});
							}else{
								logger.log('error', err);
								dcm_item_cb(null);
							}
						});
	
						logger.log('info', 'DCMSEND OK. ('+inputFile+')');
					}else{
						logger.log('error', err);
						dcm_item_cb(null);
					}
				}
			);
		}, function done() {
			dcm_cb(null);
		});	
	} catch (err) {
		logger.log('error', 'Try Catch:' + err);
	}
}

// Busca archivos PDF, DICOM, convierte y envia
function search() {
	fs.readdir(tmp, function(err, files) {
		async.parallel([
			PDF.bind(null, files), 
			PRE.bind(null, files), 
			DCM.bind(null, files)
		], function(err, results) {
			setTimeout(search, SEARCH_TIMEOUT);
		});
	});
}

// Borra carpetas ERROR y BACKUP
function cleanup() {
	function cleanFiles(filesDir) {
		fs.readdir(filesDir, function(err, files) {
			files.forEach(function(file, index) {
				fs.stat(path.join(filesDir, file), function(err, stat) {
					if (err) return logger.log('error', err);

					var now = new Date().getTime();
					var endTime = new Date(stat.ctime).getTime() + (86400000*CLEANUP_FILE_AGE);

					if (now > endTime) {
						fs.unlink(path.join(filesDir, file), function(err) {
							if(err) logger.log('error', 'Unlink #7:' + err);
						});
					}
				});
			});
		});
	}

	setTimeout(function() {
		logger.log('info', 'Ejecutando limpieza de backup.');
		cleanFiles(backup);
	}, CLEANUP_TIMEOUT);

	setTimeout(function() {
		logger.log('info', 'Ejecutando limpieza de error.');
		cleanFiles(error);
	}, CLEANUP_TIMEOUT);
}

search();
cleanup();

app.use(express.json({
	limit: '100mb'
}));
app.use(cors());

app.get('/api/ping', (req, res) => {
	res.json({
		"status": "ok"
	});
});

app.get('/api/v1/status/:id', (req, res) => {
	let accessionNumber = req.params.id;
	let tempFile = path.join(__dirname, 'tmp', accessionNumber);
	let errorFile = path.join(__dirname, 'error', accessionNumber);
	let backupFile = path.join(__dirname, 'backup', accessionNumber);

	res.json({
		"pdf": fs.existsSync(tempFile + '.pdf'),
		"pre": fs.existsSync(tempFile + '.pre'),
		"dcm": fs.existsSync(tempFile + '.dcm'),
		"err": fs.existsSync(errorFile + '.dcm'),
		"ok": fs.existsSync(backupFile + '.dcm'),
	});
});

app.post('/api/v1/convert', (req, res) => {
	let dicom = req.body.DICOM;
	let base64PDF = req.body.PDF;
	let dicomFiltered = new Object();

	if(dicom.AccessionNumber === undefined) {
		const mes = "Falta campo AccessionNumber!";
		logger.log("error", mes); 
		res.status(500).send(mes);
		return;
	}else{
		dicomFiltered.AccessionNumber = dicom.AccessionNumber;
	}

	if(dicom.PatientName === undefined) {
		const mes = "Falta campo PatientName!";
		logger.log("error", mes); 
		res.status(500).send(mes);
		return;
	}else{
		dicomFiltered.PatientName = dicom.PatientName;
	}

	if(dicom.PatientID === undefined) {
		const mes = "Falta campo PatientID!";
		logger.log("error", mes); 
		res.status(500).send(mes);
		return;
	}else{
		dicomFiltered.PatientID = dicom.PatientID;
	}

	if(dicom.PatientBirthDate !== undefined) {
		dicomFiltered.PatientBirthDate = dicom.PatientBirthDate;
	}

	if(dicom.StudyDate !== undefined) {
		dicomFiltered.StudyDate = dicom.StudyDate;
	}

	if(dicom.DocumentTitle !== undefined) {
		dicomFiltered.DocumentTitle = dicom.DocumentTitle;
	}

	if(dicom.PatientSex !== undefined) {
		if(dicom.PatientSex === 'M' || dicom.PatientSex === 'F' || dicom.PatientSex === 'O') {
			dicomFiltered.PatientSex = dicom.PatientSex;
		}else{
			const mes = "Valor de PatientSex invalido!";
			logger.log("error", mes); 
			res.status(500).send(mes);
			return;
		}
	}

	if(dicom.StudyDescription !== undefined) {
		dicomFiltered.StudyDescription = dicom.StudyDescription.slice(0, 64);
	}

	fs.writeFile(path.join(tmp, dicomFiltered.AccessionNumber + '.pdf'), base64PDF, {encoding: 'base64'}, function(err) {
		if(err===null) {
			fs.writeFile(path.join(tmp, dicomFiltered.AccessionNumber + '.json'), JSON.stringify(dicomFiltered), function(err) {
				if(err===null) {
					logger.log('info', 'Ingreso de PDF nuevo.');
					res.send('');
				}else{
					const mes = 'Error al generar JSON.';
					logger.log('error', mes); 
					res.status(500).send(mes);
					return;
				}
			});
		}else{
			const mes = 'Error al generar PDF.';
			logger.log('error', mes); 
			res.status(500).send(mes);
			return;
		}
	});
});

app.listen(WEB_PORT, () => {
	logger.log('info', 'Escuchando en http://localhost:'+WEB_PORT);
});