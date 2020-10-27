/////////////////////////////////////////
const WEB_PORT = 5000;
const DICOM_PORT = 4242;
const DICOM_HOST = "127.0.0.1";
/////////////////////////////////////////

const fs = require('fs');
const path = require('path');
const express = require('express');
const async = require('async');
const execFile = require('child_process').execFile;
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const tmp = path.join(__dirname, "tmp");
const backup = path.join(__dirname, "backup");
const app = express();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
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

app.use(express.json({
	limit: '100mb'
}));

app.get('/test', (req, res) => {
	logger.info('info', "Test OK.");
	res.send('ok');
});

app.post('/convert', (req, res) => {
	let dicom = req.body.DICOM;
	let base64PDF = req.body.PDF;

	if(dicom.AccessionNumber === undefined) {
		const mes = "Falta campo AccessionNumber!";
		logger.log('warn', mes); 
		res.send(mes);
	}

	if(dicom.PatientName === undefined) {
		const mes = 'Falta campo PatientName!';
		logger.log('warn', mes); 
		res.send(mes);
	}

	if(dicom.PatientID === undefined) {
		const mes = 'Falta campo PatientID!';
		logger.log('warn', mes); 
		res.send(mes);
	}

	fs.writeFile(path.join(tmp, dicom.AccessionNumber + '.pdf'), base64PDF, {encoding: 'base64'}, function(err) {
		fs.writeFile(path.join(tmp, dicom.AccessionNumber + '.json'), JSON.stringify(dicom), function(err) {
			logger.log('info', "Ingreso de PDF nuevo.");
			res.send('ok');
		});
	});
});

app.listen(WEB_PORT, () => {
	logger.log('info', "Escuchando en http://localhost: "+WEB_PORT);
});

function search() {
	logger.log('info', "Buscando archivos a convertir..");
	
	fs.readdir(tmp, function(err, files) {
		async.parallel([
			function(pdf_cb) {
				let pdfs = files.filter(fileName => fileName.substr(fileName.lastIndexOf('.') + 1) === "pdf" );

				async.eachSeries(pdfs, function(item, pdf_item_cb) {
					let inputFile = path.join(tmp, item);
					let outputFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".pre");

					logger.log('info', "pdf2dcm: " + inputFile);
					execFile(
						path.join(__dirname, 'dcmtk', 'pdf2dcm.exe'), 
						[inputFile, outputFile], 
						function(err, data) {    
					    	if(err === null) {
							 	fs.unlink(inputFile, function(err) {
							 		if(err) console.log(err);
							 		pdf_item_cb(null);
							 	});
					    	}else{
					    		logger.log('error', "Error al ejecutar pdf2dcm.exe. "+data);
					    		pdf_item_cb(null);
					    	}
				    	}
				    );
				}, function done() {
					pdf_cb(null);
				});
			},
    		function(pre_cb) {
    			let pre = files.filter(fileName => fileName.substr(fileName.lastIndexOf('.') + 1) === "pre" );

				async.eachSeries(pre, function(item, pre_item_cb) {
					let inputFile = path.join(tmp, item);
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

						if(err) {
							logger.log('error', err);
						    pre_item_cb(null);
						}

						let jsonData = JSON.parse(rawJsonData);

						if(jsonData.AccessionNumber === undefined) {
							accessionNumberTag = '';
						}else{
							accessionNumberTag = jsonData.AccessionNumber;
						}

						if(jsonData.PatientName === undefined) {
							patientNameTag = '';
						}else{
							patientNameTag = jsonData.PatientName;
						}

						if(jsonData.PatientID === undefined) {
							patientIDTag = '';
						}else{
							patientIDTag = jsonData.PatientID;
						}

						if(jsonData.PatientBirthDate === undefined) {
							patientBirthDateTag = '';
						}else{
							patientBirthDateTag = jsonData.PatientBirthDate;
						}

						if(jsonData.PatientSex === undefined) {
							patientSexTag = '';
						}else{
							patientSexTag = jsonData.PatientSex;
						}

						if(jsonData.StudyID === undefined) {
							studyIDTag = '';
						}else{
							studyIDTag = jsonData.StudyID;
						}

						logger.log('info', "dcmodify: " + inputFile);
						execFile(
							path.join(__dirname, 'dcmtk', 'dcmodify.exe'), 
							[
								'-i', "(0008,0050)="+accessionNumberTag, 
								'-i', "(0010,0010)="+patientNameTag,
								'-i', "(0010,0020)="+patientIDTag,
								'-i', "(0010,0030)="+patientBirthDateTag,
								'-i', "(0010,0040)="+patientSexTag,
								'-i', "(0020,0010)="+studyIDTag,
								inputFile
							], 
							function(err, data) {
						    	if(err === null) {
								 	fs.rename(inputFile, outputFile, function(err) {
								 		if(err === null) {
								 			pre_item_cb(null);
								 		}else{
								 			logger.log('error', "Error al ejecutar dcmodify.exe. "+data);
								 			pre_item_cb(null);
								 		}
								 	});
						    	}else{
						    		logger.log('error', err);
						    		pre_item_cb(null);
						    	}
					    	}
					    );
					});
				}, function done() {
    				pre_cb(null);
				});
    		},
    		function(dcm_cb) {
    			let dcm = files.filter(fileName => fileName.substr(fileName.lastIndexOf('.') + 1 ) === "dcm" );

    			async.eachSeries(dcm, function(item, dcm_item_cb) {
    				let inputFile = path.join(tmp, item);
    				let backupFile = path.join(backup, item);

    				let preBakFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".pre.bak");
					let jsonFile = path.join(tmp, item.split('.').slice(0, -1).join('.') + ".json");

					// envia por DICOM
					logger.log('info', "dcmsend: " + inputFile);
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
													if(err) logger.log('error', err);
													callback1(null);
												});
										    },
										    function(callback2) {
										    	fs.unlink(jsonFile, function(err) {
													if(err) logger.log('error', err);
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
							}else{
								logger.log('error', err);
								dcm_item_cb(null);
							}
						}
					);
    			}, function done() {
					dcm_cb(null);
    			});	
    		}
		], function(err, results) {
			setTimeout(search, 5000);
		});
	});
}

search();