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
        data.Streams.map(stream => stream.Url).forEach((url) => {
            var index = nextIndex();
            possibleStreams[index] = {
                url,
                name: streaminfo.name                          
            }; 
            $("#streams").append(createStreamDiv(index));          
            switchToStartButton(index)                                                             
        });        
    });
}

function createStreamDiv(index) {
    var textfield = '<input type="text" readonly value="' + possibleStreams[index].url +'"/>';
    var toggleButton = createToggleButton(index);
    var scheduleButton = '<button type="button" onclick="schedule(' + index + ');">Schedule</button>';
    return '<div id="stream' + index + '"><b>' + possibleStreams[index].name + '</b>' + textfield + toggleButton + scheduleButton + '</div>';
}

function createToggleButton(index) {
    return '<button type="button" id="toggleButton' + index + '" index="' + index + '">?</button>';
}

function switchToStartButton(index) {
    $("#toggleButton" + index).attr('onclick', "startDownload($(this).attr('index'));");
    $("#toggleButton" + index).html('Start download');
}

function switchToCancelButton(index) {
    $("#toggleButton" + index).attr('onclick', "cancelDownload($(this).attr('index'));");
    $("#toggleButton" + index).html('Cancel download');
}

function cancelDownload(index) {          
    var stream = runningStreams[index];
    stream.request.abort();    
    switchToStartButton(index);
    runningStreams.splice(index, 1);    
}

function startDownload(index) {   
    var storedFilePath = dialog.showSaveDialog();
    if (storedFilePath) {
        downloadTo(storedFilePath, index);
    }
}

function downloadTo(storedFilePath, index) {
    var url = possibleStreams[index].url;    
    var file = fs.createWriteStream(storedFilePath);
    var request = http.get(url, function(response) {
        response.pipe(file);
    });
    var streamInfo = possibleStreams[index];
    runningStreams[index] = 
        {url,
        file,
        request};
        switchToCancelButton(index);    
}

function onClickAnalyse() {
    $("#streamplaylists").empty();
    $("#streams").empty();    
    $("#scheduled").empty();    
    $("#streaminfos").empty();            
    
    readTuneInPage($('#tuneinUrl').val());
}

function schedule(index) {
    currentlyEditedSchedule = {index};
    var date = new Date(); 
    date.setMinutes(date.getMinutes() + 5);
    $("#beginTime").val(converter.format(date));
    date.setHours(date.getHours() + 1);
    $("#endTime").val(converter.format(date));        
    $("#schedulePopup").removeClass('hiddenPopup');          
}

function saveSchedule() {   
    var index = currentlyEditedSchedule.index; 
    currentlyEditedSchedule.startTime = parseDate($("#beginTime").val());
    currentlyEditedSchedule.endTime = parseDate($("#endTime").val() );
    scheduledStreams[index] = currentlyEditedSchedule;
    
    if (currentlyEditedSchedule.startTime > new Date().getTime() &&  currentlyEditedSchedule.endTime > currentlyEditedSchedule.startTime) {
        var storedFilePath = dialog.showSaveDialog();
        if (storedFilePath) {
            var timeContent = $("#beginTime").val() + ' - ' + $("#endTime").val();
            var deleteButton = '<button type="button" onclick="deleteSchedule(' + currentlyEditedSchedule.index + ');" >Delete</button>';
            var status = '<p id="status' + index + '">Scheduled</p>';
            $("#scheduled").append('<div id="schedule' + index + '">' + timeContent + deleteButton + status + '</div>');
            $("#schedulePopup").addClass('hiddenPopup');
            setTimeout(function () {
                startSchedule(storedFilePath, index);
            }, currentlyEditedSchedule.startTime.getTime() - new Date().getTime());
            currentlyEditedSchedule = null; 
        }  
    }
}

function parseDate(text) {
    var now = new Date();
    var parsed = converter.parse(text);
    parsed.setFullYear(now.getFullYear());
    return parsed;  
}

function startSchedule(storedFilePath, index) {    
    downloadTo(storedFilePath, index);
    $("#status" + index).html('Running');
    setTimeout(function() {
         cancelDownload(index);
         scheduledStreams[index] = null;
         $("#status" + index).html('Finished');
    }, scheduledStreams[index].endTime -  scheduledStreams[index].startTime);
}

function deleteSchedule(index) {
    scheduledStreams[index] = null;
    $("#schedule" + index).remove();
}

function nextIndex() {
    return currentIndex++;
}

$(document).ready(() => {
    AnyTime.picker( "beginTime", { format: anytimeFormat, firstDOW: 1 } );
    AnyTime.picker( "endTime", { format: anytimeFormat, firstDOW: 1 } );    
});




