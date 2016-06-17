'use strict';
var http = require('http');
var fs = require('fs');
const {dialog} = require('electron').remote;

const anytimeFormat = "%D.%M. %H:%i";
   
var possibleStreams = [];
var runningStreams = [];
var scheduledStreams = [];
var currentlyEditedSchedule = null; 
var currentIndex = 0;

const converter = new AnyTime.Converter({format: anytimeFormat});

function readTuneInPage(url) {    
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
    $("#downloads").append('<div id="download' + downloadIndex + '">' + runningStream.path + '</div>');
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

$(document).ready(() => {
    AnyTime.picker( "beginTime", { format: anytimeFormat, firstDOW: 1 } );
    AnyTime.picker( "endTime", { format: anytimeFormat, firstDOW: 1 } );    
});




