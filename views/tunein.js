'use strict';
var http = require('http');
var fs = require('fs');
const {dialog} = require('electron').remote;

var possibleStreams = [];
var runningStreams = []; 

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
    downloadStreamUrl(streaminfo);
}

function downloadStreamUrl(streaminfo) {
    var url = "http://tunein.com/tuner/tune/?streamId=" + streaminfo.streamid + "&stationId=" + streaminfo.stationid + "&tuneType=Station&ignoreLinkedStations=true"
    $("#streaminfos").append('<b>' + streaminfo.name + '</b>: ' + url + "<br/>");
    $.ajax({url: url})
    .done(data => {
        var streamUrl = "http://" + data.StreamUrl.substr(2);
        $("#streamplaylists").append('<b>' + streaminfo.name + '</b>: ' + streamUrl+ "<br/>");
        downloadStream(streaminfo, streamUrl);
    });
}

function downloadStream(streaminfo, streamUrl) {
    $.ajax({url: streamUrl}).done(data => {
        $("#streams")
        var streams = data.Streams;
        console.log("Found stream: " + streams.length);
        streams.map(stream => stream.Url).forEach((url) => {
            var index = possibleStreams.length;
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
    var button = createToggleButton(index);    
    return '<div id="stream' + index + '"><b>' + possibleStreams[index].name + '</b>' + textfield + button + '</div>';
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
    var url = possibleStreams[index].url;
    var storedFilePath = dialog.showSaveDialog();
    if (storedFilePath) {
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
}

function onClickAnalyse() {
    $("#streamplaylists").empty();
    $("#streams").empty();    
    $("#scheduled").empty();    
    $("#streaminfos").empty();            
    
    readTuneInPage($('#tuneinUrl').val());
}