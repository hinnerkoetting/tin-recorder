'use strict';
var http = require('http');
var fs = require('fs');

var possibleStreams = [];
var runningStreams = [];
 

function readTuneInPage(url) {
    $.ajax({url: url})
    .done(data => {
        var streamInfos = $(data).find(".stream-info").find('a');
        downloadStreaminfo($(streamInfos[0]));
        streamInfos.each((index, info) => {
            console.log(info);    
        });            
    });  
}

function downloadStreaminfo(streaminfoLink) {
    var streaminfo = {
        streamid: streaminfoLink.attr('data-streamid'),
        stationid: streaminfoLink.attr('data-stationid')
    };    
    downloadStreamUrl(streaminfo);
}

function downloadStreamUrl(streaminfo) {
    var url = "http://tunein.com/tuner/tune/?streamId=" + streaminfo.streamid + "&stationId=" + streaminfo.stationid + "&tuneType=Station&ignoreLinkedStations=true"
    $("#streaminfo").val(url);
    $.ajax({url: url})
    .done(data => {
        var streamUrl = "http://" + data.StreamUrl.substr(2);
        $("#stream").val(streamUrl);
        downloadStream(streamUrl);
    });
}

function downloadStream(streamUrl) {
    $.ajax({url: streamUrl}).done(data => {
        $("#streams")
        var streams = data.Streams;
        console.log("Found stream: " + streams.length);
        streams.map(stream => stream.Url).forEach((url) => {
            var index = possibleStreams.length;
            possibleStreams[index] = {
                url                            
            }; 
            $("#streams").append(createStreamDiv(index));          
            switchToStartButton(index)                                                             
        });        
    });
}

function createStreamDiv(index) {
    var textfield = '<input type="text" readonly value="' + possibleStreams[index].url +'"/>';
    var button = createToggleButton(index);    
    return '<div id="stream' + index + '">' + textfield + button + '</div>';
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
    var file = fs.createWriteStream("/home/hinni/electron/stream.mp3");
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
    readTuneInPage($('#tuneinUrl').val());
}