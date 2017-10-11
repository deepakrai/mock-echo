
const http = require("http");
const util = require('util');
const getRawBody = require('raw-body')
const contentType = require('content-type')
const formidable = require('formidable');
const path = require('path');
const url = require('url');
const fs = require('fs');
const csvParse = require('csv-parse');
const csv = require("csv");
const st = require('st');
const SQL = require('sql.js');
const uuid = require('uuid/v4');
const randomstring = require("randomstring");
const dateAndTime = require('date-and-time');

// Pass the port number as parameter - node index.js 8888
const port = parseInt(process.argv.slice(2));
const DEFAULT_RESPONSE = "OK";
const DEFAULT_RESPONSE_CODE = 200;
const MISSING_URL = "URL not set";
const SAMPLE_CSV_FILE = "sample.csv";
const fileUploadPath = "file_upload";
const queryDefaults = ["url", "response", "responseCode"];
// maps file extention to MIME types
const MIME_TYPE = {
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.eot': 'appliaction/vnd.ms-fontobject',
    '.ttf': 'aplication/font-sfnt',
    '.ttf': 'aplication/font-sfnt',
    '.gz': 'application/gzip'
  };

var db = new SQL.Database();

const mount = st({ path: __dirname + '/' + fileUploadPath, url: '/fileDownload', cache: false })

var server = http.createServer(function(request, response) {
  var path = url.parse(request.url).pathname;
    if(request.url === '/favicon.ico'){
        console.log('favicon');
        return;
    }
    console.log(path);

    // Static File Server, for which files are hosted via fileUpload
    if (path.startsWith("/fileDownload")) {
      var stHandled = mount(request, response);
      if (stHandled) {
        return;
      }
    }

    switch (path) {
      case '/fileUpload':
        var query = url.parse(request.url,true).query;
        console.log(query.url);
        parameters = getParameters(query);
        console.log("parameters ", parameters);

        var midPath = query.url || "";
        console.log("midPath :" + midPath);
        var form = new formidable.IncomingForm();
        form.parse(request, function (err, fields, files) {
          console.log(JSON.stringify(files));
          console.log(files.path);
          console.log(files["file"]);
          console.log(files["file"]["path"]);
          var oldpath = files["file"]["path"];
          console.log("oldpath :" + oldpath);
          var newpath = './' + fileUploadPath + '/' + midPath + '/';
          console.log("newpath :- " + newpath);
          mkdirPath(newpath); // Create the Folder

          newpath = './' + fileUploadPath + '/' + midPath + '/' + files["file"]["name"];
          newpath = newpath.replace(/\/\//g, "/");
          console.log("newpath : " + newpath);

          // Put the file in fileUploadPath
          fs.rename(oldpath, newpath, function (err) {
            if (err) throw err;
          });

          var urlToSet = '/' + midPath + '/' + files["file"]["name"];
          urlToSet = urlToSet.replace(/\/\//g, "/");
          var responseText = DEFAULT_RESPONSE;
          var responseCode = DEFAULT_RESPONSE_CODE;
          var counter = 0;
          insertIntoDB(urlToSet, parameters, responseText, responseCode, counter, 1);
          displayAllRecords();
        });
        response.write('File uploaded !\n');
        response.end();
        break;

      case '/fileDelete':
        var query = url.parse(request.url,true).query;
        console.log(query.file);
        parameters = getParameters(query);
        console.log("parameters ", parameters);

        var filePath = fileUploadPath + "/" + query.file;
        var responseString = "";

        var urlToQuery = "/" + query.file;
        urlToQuery = urlToQuery.replace(/\/\//g, "/");
        var getterID = searchForResponse(urlToQuery, parameters);
        deleteId(getterID);

        if (fs.existsSync(filePath) && (query.file.length > 0)) {
          fs.unlinkSync(filePath);
          responseString = "File deleted successfully - " + query.file + " !"
        } else {
          responseString = "File deletion failed - " + query.file + " !"
        }
        displayAllRecords();

        response.write(responseString + '\n');
        response.end();
        break;

      case '/setBulkViaCSV':
        var form = new formidable.IncomingForm();
        form.parse(request, function (err, fields, files) {
          console.log("files " + JSON.stringify(files));
          var uploadJson = files["data"];
          console.log("uploadJson " + uploadJson["path"]);

          var filepath = uploadJson["path"];
          console.log("filepath " + filepath);
          var csvData=[[]];
          fs.createReadStream(filepath)
            .pipe(csvParse({delimiter: ',', relax_column_count: true}))
            .on('data', function(csvrow) {
              console.log(csvrow);
              console.log("csvrow");

              if (csvrow.length >= 1) {
                var urlToSet = "/" + csvrow[0];
                urlToSet = urlToSet.replace(/\/\//g, "/");
                var counter = 0;
                var responseText = DEFAULT_RESPONSE;
                var responseCode = DEFAULT_RESPONSE_CODE;
                var parameters = csvrow[1] || "";

                responseText = csvrow[2] || DEFAULT_RESPONSE ;
                if (isNaN(csvrow[3])) {
                    responseCode = DEFAULT_RESPONSE_CODE;
                } else {
                    responseCode = parseInt(csvrow[3]);
                }
                insertIntoDB(urlToSet, parameters, responseText, responseCode, counter, 0);

              }

            })
            .on('end',function() {
              console.log(csvData);
            });
        });

        response.write("OK\n");
        response.end();
        break;

      case '/setViaPost':
        if (request.method == 'POST') {
          var setterResponse = {};
          var readCompleted = false;

          console.log("request.body " + request.body);
          console.log(JSON.stringify(request.body));

          var query = url.parse(request.url,true).query;
          console.log(query.url);
          console.log(query.responseCode);
          var urlToSet = "/" + query.url;
          urlToSet = urlToSet.replace(/\/\//g, "/");
          var counter = 0;
          var responseText = DEFAULT_RESPONSE;
          var responseCode = DEFAULT_RESPONSE_CODE;
          var parameters = "";

          parameters = getParameters(query);
          console.log("parameters ", parameters);

          getRawBody(request, {
            length: request.headers['content-length'],
            limit: '1mb',
            encoding: contentType.parse(request).parameters.charset
          }).then(function (buf) {
            responseText = String(buf);
            console.log("responseText buf " + responseText);
            insertIntoDB(urlToSet, parameters, responseText, responseCode, counter, 0);
          });

          response.write("OK\n");
          response.end();
        }
        break;

      case '/set':
        var query = url.parse(request.url, true).query;
        console.log("query ", JSON.stringify(query));

        var urlToSet = "/" + query.url;
        urlToSet = urlToSet.replace(/\/\//g, "/");
        var responseText = query.response;
        var counter = 0;
        var parameters = "";
        var responseCode = 200;

        if (isNaN(query.responseCode)) {
            responseCode = 200;
        } else {
            responseCode = query.responseCode;
        }

        parameters = getParameters(query);
        console.log("parameters ", parameters);
        insertIntoDB(urlToSet, parameters, responseText, responseCode, counter, 0);

        var setterResponse = {};
        setterResponse["url"] = urlToSet.substr(1);
        setterResponse["parameters"] = parameters;
        setterResponse["response"] = responseText;
        setterResponse["responseCode"] = responseCode;
        setterResponse["counter"] = counter;

        response.write(JSON.stringify(setterResponse, null, "    "));
        response.end();

        break;

      case '/get':
        var query = url.parse(request.url,true).query;
        console.log(query.url);

        var urlToQuery = "/" + query.url;
        urlToQuery = urlToQuery.replace(/\/\//g, "/");
        var parameters = "";

        parameters = getParameters(query);
        console.log("parameters ", parameters);
        var getterID = searchForResponse(urlToQuery, parameters);
        var result = searchById(getterID);

        var getterResponse = {};
        if (result != null) {
            getterResponse["url"] = urlToQuery.substr(1);
            getterResponse["parameters"] = result.parametersText;
            getterResponse["response"] = result.responseText;
            getterResponse["responseCode"] = result.responseCode;
            getterResponse["counter"] = result.counter;
        } else {
            getterResponse["error"] = MISSING_URL;
        }
        response.write(JSON.stringify(getterResponse, null, "    "));
        response.end();
        break;

      case '/delete':
        var query = url.parse(request.url,true).query;
        console.log(query.url);
        console.log("Inside the /delete" + filePath);

        var urlToQuery = "/" + query.url;
        urlToQuery = urlToQuery.replace(/\/\//g, "/");
        var parameters = "";

        parameters = getParameters(query);
        console.log("parameters ", parameters);
        var getterID = searchForResponse(urlToQuery, parameters);

        if (getIsFileFlag(getterID) == 1) {
          var filePath = fileUploadPath + urlToQuery;
          console.log("Deleting File - " + filePath);
          if (fs.existsSync(filePath) && (urlToQuery.length > 0)) {
            fs.unlinkSync(filePath);
            responseString = "File deleted successfully - " + query.file + " !"
          } else {
            responseString = "File deletion failed - " + query.file + " !"
          }
        }
        deleteId(getterID);
        displayAllRecords();

        if (getterID > 0) {
          response.write("Deleted successfully!");
        } else {
          response.write("Record not found for mentioned combination!");
        }
        response.end();
        break;

      case '/reset':
        var query = url.parse(request.url,true).query;
        console.log(query.url);

        var urlCounterToReset = "/" + query.url;
        urlCounterToReset = urlCounterToReset.replace(/\/\//g, "/");
        var parameters = "";

        parameters = getParameters(query);
        console.log("parameters ", parameters);
        var resetterID = searchForResponse(urlCounterToReset, parameters);
        if (resetterID > 0) {
          resetCounter(resetterID);
        }
        var result = searchById(resetterID);

        var getterResponse = {};
        if (result != null) {
            getterResponse["url"] = urlCounterToReset.substr(1);
            getterResponse["parameters"] = result.parametersText;
            getterResponse["response"] = result.responseText;
            getterResponse["responseCode"] = result.responseCode;
            getterResponse["counter"] = result.counter;
        } else {
            getterResponse["error"] = MISSING_URL;
        }
        response.write(JSON.stringify(getterResponse, null, "    "));
        response.end();

        break;

      default:
        var query = url.parse(request.url,true).query;
        var responseToReturn = "";

        var urlInvoked = path;
        urlInvoked = urlInvoked.replace(/\/\//g, "/");
        var parameters = "";

        parameters = getParameters(query);

        console.log("parameters ", parameters);
        console.log("urlInvoked ", urlInvoked);
        displayAllRecords();
        var getterID = searchForResponse(urlInvoked, parameters);
        console.log("getterID ", getterID);
        if (getterID > 0) {
          increaseCounter(getterID);
        }
        var result = searchById(getterID);
        console.log(result);

        if (result != null) {
          if (result.isFile == 1) {
            filePath = fileUploadPath + urlInvoked;
            console.log("filePath " + filePath);

            fs.exists(filePath, function(exists) {
              if (exists) {
                console.log("inside exists filePath " + filePath);

                fs.readFile(filePath, function(err, data){
                  if(err){
                    response.statusCode = 500;
                    response.end(`Error getting the file: ${err}.`);
                  } else {
                    const path1 = require('path');
                    // based on the URL path, extract the file extention. e.g. .js, .doc, ...
                    var ext = path1.parse(filePath).ext;
                    var stat = fs.statSync(filePath);
                    // if the file is found, set Content-type and send data
                    response.setHeader('Content-type', MIME_TYPE[ext.toLowerCase()] || 'text/plain');
                    response.setHeader('Content-Length', stat.size);
                    response.writeHead(200, {
                      "Content-Type": "application/octet-stream",
                      "Content-Disposition" : "attachment"});

                    response.end(data);

                  }
                });
                console.log("done with file - " + filePath);
              } else {
                response.writeHead(400, {"Content-Type": "text/plain"});
                response.end("ERROR File does NOT Exists");
              }
            });

          } else {
            responseToReturn = result.responseText;
            responseToReturn = replaceMacro(responseToReturn);
            response.writeHead(result.responseCode);
            response.write(responseToReturn);
            response.end();
          }
        } else {
          console.log("Default Response handler.");
          responseToReturn = DEFAULT_RESPONSE;
          response.writeHead(DEFAULT_RESPONSE_CODE);
          response.write(responseToReturn);
          response.end();
        }
        break;
    }
    // response.end();
});

db.run("CREATE TABLE IF NOT EXISTS mock_echo (id INTEGER PRIMARY KEY, url TEXT, parameters TEXT, response TEXT, response_code INT, counter INT, is_file INT);");

if (fs.existsSync(SAMPLE_CSV_FILE)) {
    var csvData=[[]];
    fs.createReadStream("sample.csv")
      .pipe(csvParse({delimiter: ',', relax_column_count: true}))
      .on('data', function(csvrow) {
        console.log(csvrow);
        console.log("csvrow");

        if (csvrow.length >= 1) {
          var urlToSet = "/" + csvrow[0];
          var counter = 0;
          var response = csvrow[2] || DEFAULT_RESPONSE ;
          var responseCode = DEFAULT_RESPONSE_CODE;
          var parameters = csvrow[1] || "";

          if (isNaN(csvrow[3])) {
              responseCode = DEFAULT_RESPONSE_CODE;
          } else {
              responseCode = parseInt(csvrow[3]);
          }
          insertIntoDB(urlToSet, parameters, response, responseCode, counter, 0);
        }

      })
      .on('end',function() {
        console.log(csvData);
      });
}

function insertIntoDB(urlToSet, parameters, responseText, responseCode, counter, isFile) {
  isFile = isFile || 0;
  console.log("urlToSet ", urlToSet);
  console.log("parameters ", parameters);
  console.log("responseText ", responseText);
  console.log("responseCode ", responseCode);
  console.log("counter ", counter);
  console.log("isFile ", isFile);

  var result = searchForId(urlToSet, parameters, isFile);
  console.log("result ", result);

  console.log("result ", result.length);
  if (result.length > 0) {
    var updateID = result[0]["values"][0][0];

    console.log("Updating ", updateID);
    db.run('UPDATE mock_echo SET response = ?, response_code = ?, is_file = ? WHERE id = ? ;', [responseText, responseCode, isFile, updateID]);
  } else {
    console.log("inserting");
    db.run('INSERT INTO mock_echo VALUES (NULL,?,?,?,?,?,?);', [urlToSet, parameters, responseText, responseCode, counter, isFile]);
  }
}

function searchForId(urlToSet, parameters, isFile) {
  isFile = isFile || 0;
  var sqlParameterLikeStatment = "";
  if (parameters.length > 0) {
    var parameterArray = parameters.split("&");
    console.log("parameterArray ", parameterArray);
    parameterArray.forEach(function(element) {
      sqlParameterLikeStatment = sqlParameterLikeStatment + " AND parameters LIKE '%" + element + "%' ";
    });
  }

  var queryStatement = "SELECT id FROM mock_echo WHERE url = '" + urlToSet + "' " + sqlParameterLikeStatment + " AND is_file = " + isFile + " AND LENGTH(parameters) = " + parameters.length + " ;";
  console.log("queryStatement ", queryStatement);

  var result = db.exec(queryStatement);

  return result;
}

function searchForResponse(urlToSet, parameters) {
  var queryStatement = "SELECT id FROM mock_echo WHERE url = '" + urlToSet + "' ;"
  if (parameters.length == 0) {
    queryStatement = "SELECT id FROM mock_echo WHERE url = '" + urlToSet + "' AND parameters = '';"
  }
  console.log("queryStatement ", queryStatement);
  var result = db.exec(queryStatement);
  console.log("result ", result.length);
  console.log("result ", result);
  console.log("result ", JSON.stringify(result));
  var urlIdList = new Array();
  if (result.length > 0 ) {
    console.log("searchForResponse length ", result[0]["values"].length);
    if (result[0]["values"].length == 1) {
      console.log("result[0][values][0][0] ", result[0]["values"][0][0]);
      return result[0]["values"][0][0];
    } else if (result[0]["values"].length > 1) {
      for (var i = 0; i < result[0]["values"].length; i ++ ){
        urlIdList.push(result[0]["values"][i][0]);
      }
    }
  } else {
    return 0;
  }
  console.log("searchForResponse ", result);
  console.log("searchForResponse ", JSON.stringify(result));
  console.log("searchForResponse ", result[0]["values"][0].size);
  console.log("searchForResponse ", result[0]["values"][0].length);

  console.log("urlIdList ", urlIdList);
  if (parameters.length == 0) {
    return urlIdList[0];
  }

  var parameterBasedIdMap = {};
  var parameterArray = parameters.split("&");
  console.log("parameterArray ", parameterArray);

  var finalParameterArray = [];
  var i = 0;
  parameterArray.forEach(function(element) {
    queryStatement = "SELECT id FROM mock_echo WHERE url = '" + urlToSet + "' AND parameters LIKE '%" + element + "%' ;";
    console.log("queryStatement ", queryStatement);
    result = db.exec(queryStatement);
    if (result.length > 0 ) {
      finalParameterArray[i] = element;
      i++;
    }
  });
  console.log("finalParameterArray ", finalParameterArray);
  console.log("finalParameterArray ", finalParameterArray.length);
  if (finalParameterArray.length == 0) {
    return urlIdList[0];
  }

  var parameterCombinationArray = parameterCombination(finalParameterArray);
  console.log(parameterCombinationArray);

  for (var i = (parameterCombinationArray.length - 1); i >= 0; i-- ) {
    console.log("parameterCombinationArray[i] ", parameterCombinationArray[i]);
    console.log("parameterCombinationArray[i].length ", parameterCombinationArray[i].length);
    if (parameterCombinationArray[i].length > 0) {
      queryStatement = "SELECT id FROM mock_echo WHERE url = '" + urlToSet + "' ";
      if (parameterCombinationArray[i].length == 1) {
        queryStatement = queryStatement + " AND parameters LIKE '" + parameterCombinationArray[i][0] + "' ";
      } else {
        parameterCombinationArray[i].forEach(function(element) {
          queryStatement = queryStatement + " AND parameters LIKE '%" + element + "%' ";
        });
      }
      queryStatement = queryStatement + " ;";
      console.log(queryStatement);
      result = db.exec(queryStatement);
      if (result.length > 0 ) {
        return result[0]["values"][0][0];
      }
    }

  }
}

function parameterCombination(letters) {
  var combinations = [[]];
  var temp = [];

  var letLen = Math.pow(2, letters.length);

  for (var i = 0; i < letLen ; i++){
      for (var j = 0; j < letters.length; j++) {
        if (i & Math.pow(2, j)) {
          temp.push(letters[j]);
        }
      }
      if (temp !== "") {
        combinations.push(temp);
      }
  }
  return combinations;
}

function searchById(id) {
  var queryStatement = "SELECT url, parameters, response, response_code, counter, is_file FROM mock_echo WHERE id = " + id + " ;";
  console.log("queryStatement ", queryStatement);

  var result = db.exec(queryStatement);
  console.log(result);
  console.log(JSON.stringify(result));
  if (result.length > 0 ) {
    return {
      url : result[0]["values"][0][0],
      parametersText : result[0]["values"][0][1],
      responseText : result[0]["values"][0][2],
      responseCode : result[0]["values"][0][3],
      counter: result[0]["values"][0][4],
      isFile: result[0]["values"][0][5],
    };
  } else {
    return null;
  }
}

function resetCounter(id) {
  setCounter(id, 0)
}

function displayAllRecords() {
  var queryStatement = "SELECT * FROM mock_echo ;";
  console.log("queryStatement ", queryStatement);
  var result = db.exec(queryStatement);
  console.log(JSON.stringify(result));
}

function getIsFileFlag(id) {
  var queryStatement = "SELECT is_file FROM mock_echo WHERE id = " + id + " ;";
  console.log("queryStatement ", queryStatement);
  var result = db.exec(queryStatement);
  console.log(JSON.stringify(result));
  if (result.length > 0 ) {
    return result[0]["values"][0][0];
  }
  return null;
}

function setCounter(id, counter) {
  var updateStatement = "UPDATE mock_echo SET counter = " + counter + " WHERE id = " + id + " ;";
  console.log("updateStatement ", updateStatement);
  var result = db.exec(updateStatement);
  console.log(result);
}

function increaseCounter(id) {
  var updateStatement = "UPDATE mock_echo SET counter = (counter + 1) WHERE id = " + id + " ;";
  console.log("updateStatement ", updateStatement);
  var result = db.exec(updateStatement);
  console.log(result);
}

function deleteId(id) {
  var deleteStatement = "DELETE FROM mock_echo WHERE id = " + id + " ;";
  console.log("deleteStatement ", deleteStatement);
  var result = db.exec(deleteStatement);
  console.log(result);
}

function sortMapByValue(map) {
  var tupleArray = [];
  for (var key in map) tupleArray.push([key, map[key]]);
  tupleArray.sort(function (a, b) { return a[1] - b[1] });
  return tupleArray;
}

function getParameters(parametersText) {
  console.log("parametersText ", parametersText);
  var parameters = "";
  for (var propName in parametersText) {
    console.log(parametersText , "  ", parametersText[propName]);
    if (queryDefaults.indexOf(propName) == -1) {
      if (propName.length > 0 && parametersText[propName].length > 0) {
        var temp = propName + "=" + parametersText[propName];
        if (parameters.length > 0) {
          parameters = parameters + "&";
        }
        parameters = parameters + propName + "=" + parametersText[propName]
      }
    }
  }
  console.log("parameters ", parameters);
  return parameters;
}

function replaceMacro(responseText) {
  if ((responseText == null) || (responseText.length == 0)) {
    return DEFAULT_RESPONSE;
  }
  var tempString = responseText;

  var macroList = [];

  while (tempString != ""){
    var temp = tempString.substring(tempString.indexOf("MOCK_ECHO"), tempString.indexOf("ECHO_MOCK"));
    if (temp != "") {
      macroList.push(temp + "ECHO_MOCK");
    }
    tempString = tempString.substring(tempString.indexOf("ECHO_MOCK") + 9);
  }
  console.log(macroList);

  var updatedResponse = responseText;

  macroList.forEach(function(element) {
    var regex = new RegExp(element, "g");
    console.log(element);
    if (element == "MOCK_ECHO_UUID_ECHO_MOCK") {
      var regex = new RegExp(element, "g");
      updatedResponse = updatedResponse.replace(regex, uuid());
    } else if (element.startsWith("MOCK_ECHO_RANDOM_STRING_")) {
        var tempArray = element.split("_");
        var temp = "";
        if (Number.isInteger(Number(tempArray[4]))) {
          temp = randomstring.generate({
              length: Number(tempArray[4]),
              charset: 'alphabetic'
            });
        }
        updatedResponse = updatedResponse.replace(regex, temp);
    } else if (element.startsWith("MOCK_ECHO_RANDOM_NUMBER_")) {
      var tempArray = element.split("_");
      var temp = "";
        if (Number.isInteger(Number(tempArray[4]))) {
          temp = randomstring.generate({
              length: Number(tempArray[4]),
              charset: 'numeric'
            });
        }
        updatedResponse = updatedResponse.replace(regex, temp);
    } else if (element.startsWith("MOCK_ECHO_CURRENT_DATETIME_")) {
      var tempArray = element.split("_");
      var now = new Date();
      var temp = dateAndTime.format(now, tempArray[4]);

      console.log("regex " + regex);
      console.log("temp " + temp);
      console.log("updatedResponse.replace(regex, temp); " + updatedResponse.replace(regex, temp));
      updatedResponse = updatedResponse.replace(regex, temp);
    }
  });

  console.log(updatedResponse);
  return updatedResponse;
}

function mkdirPath(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath);
    } catch(e) {
      mkdirPath(path.dirname(dirPath));
      mkdirPath(dirPath);
    }
  }
}

server.listen(port);
console.log("Server is listening " + port);
