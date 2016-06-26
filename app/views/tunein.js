'use strict';

function showError(message) {    
    $("#errors").append("<div>" + message + "</div>");    
}

function onFatalError(message) {    
    console.error(message);    
    $("#errors").append("<div>" + message + "</div>");
    require('electron').ipcRenderer.send('onError', '');
}

process.on('uncaughtException', (err) => {    
    onFatalError('Fatal error: ' + err.message);
});

var http = require('http');
var fs = require('fs');
var osHomedir = require('os-homedir');
const {dialog} = require('electron').remote;
const path = require('path');

const anytimeFormat = "%D.%M. %H:%i";

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
        var streamInfos = $(data).find(".stream-info").find('a');
        streamInfos.each((index, streamInfo) => {
            downloadStreaminfo(streamInfo);             
        })                  
    });  
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
            processStreamUrl(streaminfo, streamUrl);
        });
}

function processStreamUrl(streaminfo, streamUrl) {
    $.ajax({url: streamUrl}).done(data => {                        
        data.Streams.forEach((stream) => {
            var index = nextIndex();
            possibleStreams[index] = {
                url: stream.Url,
                mediaType: stream.MediaType,
                name: streaminfo.name,
                index                         
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
    date.setHours(date.getHours() + 1);
    $("#endTime").val(converter.format(date));        
    $("#schedulePopup").removeClass('hiddenPopup');          
}

function saveSchedule() {   
    var streamIndex = currentlyEditedSchedule.index; 
    currentlyEditedSchedule.startTime = parseDate($("#beginTime").val());
    currentlyEditedSchedule.endTime = parseDate($("#endTime").val() );

    const scheduleIndex = nextIndex();
    scheduledStreams[scheduleIndex] = currentlyEditedSchedule;
    
    if (currentlyEditedSchedule.endTime > currentlyEditedSchedule.startTime) {
        var storedFilePath = getFilePath(possibleStreams[streamIndex]);
        if (storedFilePath) {
            
            var timeContent = $("#beginTime").val() + ' - ' + $("#endTime").val();
            var deleteButton = '<button type="button" onclick="deleteSchedule(' + scheduleIndex + ');" >Delete</button>';
            var status = '<span id="status' + scheduleIndex + '">Scheduled</span>';
            $("#scheduled").append('<div id="schedule' + scheduleIndex + '">' + timeContent + deleteButton + status + '</div>');
            $("#schedulePopup").addClass('hiddenPopup');
            const timeUntilStart = currentlyEditedSchedule.startTime.getTime() - new Date().getTime();
            if (timeUntilStart <= 0) {
                startSchedule(storedFilePath, possibleStreams[streamIndex], scheduleIndex);
            } else {
                setTimeout(function () {
                    startSchedule(storedFilePath, possibleStreams[streamIndex], scheduleIndex);
                }, timeUntilStart);
            }
            currentlyEditedSchedule = null; 
        }  
    }
}

function getFilePath(stream) {
    var storedFilePath = dialog.showSaveDialog();
    if (!storedFilePath) {
        return storedFilePath;
    }
    if (storedFilePath.indexOf('.') < 0) {
        return storedFilePath + '.' + stream.mediaType;
    } 
    return storedFilePath;
}

function parseDate(text) {
    var now = new Date();
    var parsed = converter.parse(text);
    parsed.setFullYear(now.getFullYear());
    return parsed;  
}

function startSchedule(storedFilePath, possibleStream, scheduleIndex) {      
    const runningDownload = downloadTo(storedFilePath, possibleStream);
    scheduledStreams[scheduleIndex].runningIndex = runningDownload.runningIndex;
    $("#status" + scheduleIndex).html('Running');
    setTimeout(function() {
        stopDownload(runningDownload.runningIndex);
        scheduledStreams[scheduleIndex] = null;
        $("#status" + scheduleIndex).html('Finished');
    }, scheduledStreams[scheduleIndex].endTime -  new Date().getTime());
}

function deleteSchedule(index) {
    const scheduledStream = scheduledStreams[index]; 
    stopDownload(scheduledStream.runningIndex);
    scheduledStreams[index] = null;
    $("#schedule" + index).remove();
}

function stopDownload(runningIndex) {          
    var runningStream = runningStreams[runningIndex];
    runningStream.request.abort();    
    switchToStartButton(possibleStreams[runningStream.streamIndex]);
    runningStreams.splice(runningIndex, 1);
    const downloadIndex = nextIndex();
    downloadedStreams[downloadIndex] = runningStream;
    var button = '<button type="button" onclick="moveToItunes(' + downloadIndex + ');" >Move to iTunes</button>';
    $("#downloads").append('<div id="download' + downloadIndex + '">' + runningStream.path + button + '</div>');
}

function moveToItunes(downloadIndex) { 
    var folders = findItunesFolder();
    if (folders.length != 1) {
        window.alert("Could not find iTunes folder at " + itunesFolder());
    } else {
        $("#download" + downloadIndex).html('Imported to iTunes');
        const oldPath = downloadedStreams[downloadIndex].path;
        var filename = path.basename(oldPath);
        fs.rename(downloadedStreams[downloadIndex].path, itunesFolder() + '/' + folders[0] + '/' + filename);
    }
}

function findItunesFolder() {   
    var baseFolder = itunesFolder(); 
    if (!fs.lstatSync(baseFolder).isDirectory()) {
        return [];
    }
    return fs.readdirSync(baseFolder).filter(function(file) {
        return fs.statSync(path.join(baseFolder, file)).isDirectory() && file.toUpperCase().indexOf('AUTO') >= 0;
    });
}

function itunesFolder() {
    return osHomedir() + "/Music/iTunes/iTunes\ Media";
}

function startDownload(index) {   
    var storedFilePath = getFilePath(possibleStreams[index]);
    if (storedFilePath) {        
        downloadTo(storedFilePath, possibleStreams[index]);
    }
}

function downloadTo(storedFilePath, possibleStream) {    
    var file = fs.createWriteStream(storedFilePath);
    var request = http.get(possibleStream.url, function(response) {
        response.pipe(file);
    });
    var runningIndex = nextIndex();
    
    runningStreams[runningIndex] = 
        {url: possibleStream.url,
        file,
        path: storedFilePath,
        request,
        streamIndex: possibleStream.index,
        runningIndex};
    switchToCancelButton(runningStreams[runningIndex]);  
    return runningStreams[runningIndex];  
}

function switchToStartButton(possibleStream) {
    $("#toggleButton" + possibleStream.index).attr('onclick', "startDownload($(this).attr('index'));");
    $("#toggleButton" + possibleStream.index).html('Start download');
}

function switchToCancelButton(runningStream) {
    $("#toggleButton" + runningStream.streamIndex).attr('onclick', "stopDownload(" + runningStream.runningIndex + ");");
    $("#toggleButton" + runningStream.streamIndex).html('Stop download');
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
    AnyTime.picker( "endTime", { format: anytimeFormat, firstDOW: 1 } );
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