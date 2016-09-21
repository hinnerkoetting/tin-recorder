'use strict';

function showError(message) {    
    $("#errors").append("<div>" + message + "</div>");    
}

function onFatalError(message, stacktrace) {    
    console.error(message);    
    if (stacktrace) {
        console.error(stacktrace);
    }
    $("#errors").append("<div>" + message + "</div>");
    require('electron').ipcRenderer.send('onError', '');
}

process.on('uncaughtException', (err) => {    
    onFatalError('Fatal error: ' + err.message, err.stack);
});

var http = require('http');
var fs = require('fs');
var osHomedir = require('os-homedir');
const {dialog} = require('electron').remote;
const path = require('path');
const mkdirp = require('mkdirp');

const anytimeFormat = "%e %W %H:%i";

var possibleStreams = [];
var runningStreams = [];
var scheduledStreams = [];
var downloadedStreams = [];
var currentlyEditedSchedule = null; 
var currentIndex = 0;

const converter = new AnyTime.Converter({format: anytimeFormat});    


function readTuneInPage(url) {
    showLoadingAnimation();
    $.ajax({url: url})
        .done(data => {
            const streamLinksAvailable = analyseViaStreamLinks(data);
            if (!streamLinksAvailable) {
                const payloadAvailable = analyseViaJavascriptPayload(data);
                if (!payloadAvailable) {
                    $("#streams").append("Could not find any streams.");
                } 
            }                    
        });  
}

function analyseViaStreamLinks(data) {    
    var streamInfos = $(data).find(".stream-info").find('a');
    if (streamInfos.length == 0) {
        return false;
    } else {
        streamInfos.each((index, streamInfo) => {
            downloadStreaminfo(streamInfo);             
        });
        return true;
    }      
}

function analyseViaJavascriptPayload(data) {
    try {
        var myRegexp = new RegExp('TuneIn.payload.*');
        var match = myRegexp.exec(data)[0].substr('TuneIn.payload = '.length);
        var payload = JSON.parse(match);
        console.log(payload);
        processStreamStationInfo(payload.Station);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }  
}


function downloadStreaminfo(streaminfoLink) {
    var streaminfo = {
        streamid: $(streaminfoLink).attr('data-streamid'),
        stationid: $(streaminfoLink).attr('data-stationid'),
        name: $(streaminfoLink).html()
    };    
    processStreamInfo(streaminfo);
}

function processStreamInfo(streaminfo) {
    var url = "http://tunein.com/tuner/tune/?streamId=" + streaminfo.streamid + "&stationId=" + streaminfo.stationid + "&tuneType=Station&ignoreLinkedStations=true"    
    $.ajax({url})
        .done(data => {
            var streamUrl = "http://" + data.StreamUrl.substr(2);            
            processStreamUrl(streaminfo, streamUrl, data.Title);
        });
}

function processStreamStationInfo(streaminfo) {
    var url = "http://tunein.com/tuner/tune/?stationId=" + streaminfo.stationId + "&tuneType=Station&ignoreLinkedStations=true"    
    $.ajax({url})
        .done(data => {
            var streamUrl = "http://" + data.StreamUrl.substr(2);            
            processStreamUrl(streaminfo, streamUrl, data.Title);
        });
}

function processStreamUrl(streaminfo, streamUrl, title) {
    $.ajax({url: streamUrl}).done(data => {                        
        data.Streams.forEach((stream) => {
            var index = nextIndex();
            possibleStreams[index] = {
                url: stream.Url,
                mediaType: stream.MediaType,
                name: streaminfo.name ? streaminfo.name: streaminfo.description,
                index,
                title
            }; 
            $("#streams").append(createStreamDiv(index));          
            switchToStartButton(possibleStreams[index])                                                             
        });        
    });
}

function createStreamDiv(index) {    
    var toggleButton = createToggleButton(index);
    var scheduleButton = '<button type="button" onclick="schedule(' + index + ');">Schedule</button>';
    return '<div id="stream' + index + '"><b>' + possibleStreams[index].name + '</b>' + toggleButton + scheduleButton + '</div>';
}

function createToggleButton(index) {
    return '<button type="button" id="toggleButton' + index + '" index="' + index + '">?</button>';
}

function onClickAnalyse() {    
    $("#streams").empty();                         
    
    readTuneInPage($('#tuneinUrl').val());
}

function schedule(index) {
    currentlyEditedSchedule = {stream: possibleStreams[index], index};
    var date = new Date(); 
    date.setMinutes(date.getMinutes() + 5);
    $("#beginTime").val(converter.format(date));            
    $("#schedulePopup").removeClass('hiddenPopup');          
}

function saveSchedule() {   
    var streamIndex = currentlyEditedSchedule.index; 
    currentlyEditedSchedule.startTime = parseDate($("#beginTime").val());
    currentlyEditedSchedule.startTime.setMonth(new Date().getMonth());
    currentlyEditedSchedule.duration = $("#duration").val();
    if (!currentlyEditedSchedule.duration) {
        currentlyEditedSchedule.duration = 30;
    }

    const scheduleIndex = nextIndex();
    scheduledStreams[scheduleIndex] = currentlyEditedSchedule;
    
    if (isPositiveInteger(currentlyEditedSchedule.duration)) {                    
        var timeContent = $("#beginTime").val() + ' (' + currentlyEditedSchedule.duration + " minutes)";
        var deleteButton = '<button type="button" onclick="deleteSchedule(' + scheduleIndex + ');" >Stop</button>';
        var status = '<span id="status' + scheduleIndex + '">Scheduled</span>';
        $("#scheduled").append('<div id="schedule' + scheduleIndex + '">' + timeContent + deleteButton + status + '</div>');
        $("#schedulePopup").addClass('hiddenPopup');
        const timeUntilStart = currentlyEditedSchedule.startTime.getTime() - new Date().getTime();
        if (timeUntilStart <= 0) {
            startScheduledDownload(possibleStreams[streamIndex], scheduleIndex);
        } else {
            setTimeout(function () {
                if (possibleStreams[streamIndex]) {
                    startScheduledDownload(possibleStreams[streamIndex], scheduleIndex);
                }
            }, timeUntilStart);
        }
        currentlyEditedSchedule = null;
    }
}

function isPositiveInteger(n) {
    return 0 === n % (!isNaN(parseFloat(n)) && 0 <= ~~n);
}

function getFilePath(stream) {
    const baseFolder = getDownloadFolder();
    return baseFolder + "/" + stream.title + "-" + currentDateFormatted() + "." + stream.mediaType;    
}

function currentDateFormatted() {
    const now = new Date();
    return now.getFullYear() + "-"
                + (now.getMonth()+1)  + "-" 
                + now.getDate() + "_"  
                + now.getHours() + "_"  
                + now.getMinutes() + "_" 
                + now.getSeconds();
}

function getDownloadFolder() {
    const folder = osHomedir() + "/tunein-recorder";
    if (!fs.existsSync(folder)) {
        mkdirp(folder, function(err) {
            onFatalError(err);
        });    
    };
    return folder;
}

function parseDate(text) {
    var now = new Date();
    var parsed = converter.parse(text);
    parsed.setFullYear(now.getFullYear());
    return parsed;  
}

function startScheduledDownload(possibleStream, scheduleIndex) {
    const filePath = getFilePath(possibleStream)      
    const runningDownload = downloadTo(filePath, possibleStream);
    scheduledStreams[scheduleIndex].runningIndex = runningDownload.runningIndex;
    $("#status" + scheduleIndex).html('Running');
    setTimeout(function() {
        stopDownload(runningDownload.runningIndex);
        scheduledStreams[scheduleIndex] = null;
        $("#status" + scheduleIndex).html('Finished');
    }, scheduledStreams[scheduleIndex].duration * 60 * 1000);
}

function deleteSchedule(index) {
    const scheduledStream = scheduledStreams[index];
    if (scheduledStream.startTime.getTime() > new Date().getTime()) {
        $("#schedule" + index).remove();
    }  else {
        stopDownload(scheduledStream.runningIndex);
        scheduledStreams[index] = null;
        $("#schedule" + index).children("button").remove();
        $("#status" + index).html('Stopped');
    }
}

function stopDownload(runningIndex) {          
    var runningStream = runningStreams[runningIndex];
    runningStream.request.abort();        
    runningStreams[runningIndex] = null;
    const downloadIndex = nextIndex();
    downloadedStreams[downloadIndex] = runningStream;
    var button = '<button type="button" onclick="moveToItunes(' + downloadIndex + ');" >Move to iTunes</button>';
    $("#downloads").append('<div id="download' + downloadIndex + '">' + runningStream.path + button + '</div>');
}

function moveToItunes(downloadIndex) { 
    var folders = findItunesFolder();
    if (folders.length != 1) {
        window.alert("I could not find iTunes auto-import folder. I searched at the following locations: " + itunesFolders());
    } else {
        $("#download" + downloadIndex).html('Imported to iTunes');
        const oldPath = downloadedStreams[downloadIndex].path;
        var filename = path.basename(oldPath);
        fs.rename(downloadedStreams[downloadIndex].path, folders[0] + '/' + filename);
    }
}

function findItunesFolder() {   
    const baseFolders = itunesFolders();
    const existingFolders = baseFolders.filter(folder => fs.existsSync(folder) && fs.lstatSync(folder).isDirectory()) ;
    return existingFolders.map(folder => {
        return fs.readdirSync(folder).filter(function(file) {
            return fs.statSync(path.join(folder, file)).isDirectory() && file.toUpperCase().indexOf('AUTO') >= 0;
        }).map(subfolder => folder + "/" + subfolder);
    }).reduce((prev, curr) => prev.concat(curr));
}

function itunesFolders() {
    const linuxWinPath = osHomedir() + "/Music/iTunes/iTunes\ Media";
    const macPath = osHomedir() + "/Music/iTunes/iTunes\ Music"
    return [linuxWinPath, macPath];
}

function startDownload(index) {   
    var storedFilePath = getFilePath(possibleStreams[index]);
    if (storedFilePath) {                
        var runningStream = downloadTo(storedFilePath, possibleStreams[index]);
        switchToCancelButton(runningStream);
    }
}

function downloadTo(storedFilePath, possibleStream) {    
    var file = fs.createWriteStream(storedFilePath);
    var request = downloadWithRetry(possibleStream.url, file);
    var runningIndex = nextIndex();
    
    runningStreams[runningIndex] = 
        {url: possibleStream.url,
        file,
        path: storedFilePath,
        request,
        streamIndex: possibleStream.index,
        runningIndex};      
    return runningStreams[runningIndex];  
}

function downloadWithRetry(url, file) {
    var retryCount = 0;
    var requestWrapper = {};
    requestWrapper.abort = function() { this.request.abort(); }
    download(url, file, requestWrapper, retryCount);
    return requestWrapper;
}

function download(url, file, requestWrapper, currentCount) {
    var request = http.get(url, function(response) {
        response.pipe(file);
    }).on('error', (e) => {
        if (currentCount >= 5) {
            onFatalError('Got error: ' + e.message + ' Retrycount exceeded...');
        } else {
            console.log('Got error: ' + e.message + ' Retrying...');
            download(url, file, currentCount + 1);
        }                
    });
    requestWrapper.request = request;
}

function switchToStartButton(possibleStream) {
    $("#toggleButton" + possibleStream.index).attr('onclick', "startDownload($(this).attr('index'));");
    $("#toggleButton" + possibleStream.index).html('Start download');
}

function switchToCancelButton(runningStream) {
    $("#toggleButton" + runningStream.streamIndex).attr('onclick', "onClickCancel(" + runningStream.runningIndex + ");");
    $("#toggleButton" + runningStream.streamIndex).html('Stop download');
}

function onClickCancel(runningIndex) {
    var runningStream = runningStreams[runningIndex];
    switchToStartButton(possibleStreams[runningStream.streamIndex]);
    stopDownload(runningIndex);    
}

function nextIndex() {
    return currentIndex++;
}

function showLoadingAnimation() {
    $("#loadingAnimation").css('visibility', 'visible');
}

function hideLoadingAnimation() {
    $("#loadingAnimation").css('visibility', 'hidden');
}

$(document).ready(() => {
    AnyTime.picker( "beginTime", { format: anytimeFormat, firstDOW: 1 } );    
    var version = require('../package.json').version;

    $("#version").html("Version: " + version);
});

$(document).ajaxStop(function() {
    hideLoadingAnimation();
});

$(document).ajaxError((event, jqxhr, settings, thrownError) => showError('Could not load page ' + settings.url));

function onClickReset() {
    if (confirm("This will remove all schedules and stop all downloads. Are you sure?"))
        location.reload();
}