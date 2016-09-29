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
var downloadedStreams = [];
var currentlyEditedSchedule = null; 

var model = {
    currentIndex: 0,
    streams: []
};

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
            var possibleStream = {
                url: stream.Url,
                mediaType: stream.MediaType,
                name: streaminfo.name ? streaminfo.name: streaminfo.description,                
                title
            };
            const inpossibleStreamIndex = possibleStreams.length;
            possibleStreams[inpossibleStreamIndex] = possibleStream;
            $("#streams").append(createStreamDiv(inpossibleStreamIndex));          
            switchToStartButton(inpossibleStreamIndex)                                                             
        });        
    });
}

function createStreamDiv(possibleStreamIndex) {    
    var toggleButton = createToggleButton(possibleStreamIndex);
    var scheduleButton = '<button type="button" onclick="schedule(' + possibleStreamIndex + ');">Schedule</button>';
    return '<div id="stream' + possibleStreamIndex + '"><b>' + possibleStreams[possibleStreamIndex].name + '</b>' + toggleButton + scheduleButton + '</div>';
}

function createToggleButton(possibleStreamIndex) {
    return '<button type="button" id="toggleButton' + possibleStreamIndex + '" index="' + possibleStreamIndex + '">?</button>';
}

function onClickAnalyse() {    
    $("#streams").empty();                         
    
    readTuneInPage($('#tuneinUrl').val());
}

function schedule(possibleStreamIndex) {
    currentlyEditedSchedule = {stream: possibleStreams[possibleStreamIndex], index: possibleStreamIndex};
    var date = new Date(); 
    date.setMinutes(date.getMinutes() + 5);
    $("#beginTime").val(converter.format(date));            
    $("#schedulePopup").removeClass('hiddenPopup');          
}

function saveSchedule() {   
    var streamIndex = nextIndex(); 
    currentlyEditedSchedule.startTime = parseDate($("#beginTime").val());
    currentlyEditedSchedule.startTime.setMonth(new Date().getMonth());    
    currentlyEditedSchedule.duration = $("#duration").val();
    currentlyEditedSchedule.type = $("input[name='schedule-type']:checked").val();
    setNextStartTime(currentlyEditedSchedule);
    if (!currentlyEditedSchedule.duration) {
        currentlyEditedSchedule.duration = 30;
    }
    
    model.streams[streamIndex] = currentlyEditedSchedule;
    
    if (isPositiveInteger(currentlyEditedSchedule.duration)) {  
        appendScheduleEntry(currentlyEditedSchedule, streamIndex);                          
        $("#schedulePopup").addClass('hiddenPopup');        
        if ($("input[name='schedule-type']:checked").val() == 'once') {
            saveOnceSchedule(streamIndex);
        } else if ($("input[name='schedule-type']:checked").val() == 'weekly') {
            saveWeeklySchedule(streamIndex);
        } else if ($("input[name='schedule-type']:checked").val() == 'daily') {
            saveDailySchedule(streamIndex);
        } else {
            throw new error("unknown scheduly type " + $("input[name='schedule-type']:checked").val());
        }
        currentlyEditedSchedule = null;
    }    
}

function appendScheduleEntry(schedule, index) { 
    const title = wrapInTd(schedule.stream.title);
    const time = wrapInTd(dateShortFormat(schedule.startTime));
    const duration = wrapInTd(schedule.duration + " minutes");
    const type = wrapInTd(schedule.type);
    const status = '<td id="status' + index + '">Waiting</td>';
    var deleteButton = '<td><button type="button" onclick="deleteSchedule(' + index + ');" >Delete</button></td>';    
    $("#scheduleTable").append('<tr id="schedule' + index + '">' + title + time + duration +  type + status + deleteButton + '</tr>');
}

function wrapInTd(element) {
    return '<td>' + element + '</td>';
}

function saveOnceSchedule(index) {
    const timeUntilStart = currentlyEditedSchedule.startTime.getTime() - new Date().getTime();
    if (timeUntilStart <= 0) {
        startScheduledDownload(index);
    } else {
        setTimeout(() => {            
            startScheduledDownload(index);                           
        }, timeUntilStart);
    }
}

function saveWeeklySchedule(index) {
    var time = currentlyEditedSchedule.startTime;    
    var sched = createWeeklySchedule(currentlyEditedSchedule.startTime);
    later.setInterval(() => {        
        startScheduledDownload(index);        
    }, sched);
    model.streams[index].schedule = sched;
    storeSchedules();
}

function saveDailySchedule(index) {
    var time = currentlyEditedSchedule.startTime;    
    var sched = createDailySchedule(currentlyEditedSchedule.startTime);
    later.setInterval(() => {        
        startScheduledDownload(index);        
    }, sched);
    model.streams[index].schedule = sched;
    storeSchedules();
}

function createWeeklySchedule(time, stream, schedule) {    
    return later.parse.recur().on(time.getDay() + 1).dayOfWeek().on(time.getMinutes()).minute().on(time.getHours()).hour();
}

function createDailySchedule(time, stream, schedule) {
    return later.parse.recur().on(time.getMinutes()).minute().on(time.getHours()).hour();
}

function isPositiveInteger(n) {
    return 0 === n % (!isNaN(parseFloat(n)) && 0 <= ~~n);
}

function getFilePath(stream) {
    const baseFolder = getRecorderBasedir();
    return baseFolder + stream.title + "-" + currentDateFormatted() + "." + stream.mediaType;    
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

function dateShortFormat(date) {        
    return formatDay(date) + " " + formatValueWithZero(date.getHours()) + ":" + formatValueWithZero(date.getMinutes());
}

function formatDay(date) {
    if (isLaterToday(date)) {
        return "Today";
    }
    return formatValueWithZero(date.getDate()) + '.' + formatValueWithZero(date.getMonth()) + '.';
}

function formatValueWithZero(value) {
    return value < 10 ? '0' + value : value;
}

function isLaterToday(date) {
    const now = new Date();
    const sameDay = date.getDate() == now.getDate() && date.getMonth() == now.getMonth();
    if (sameDay) {
        return date.getTime() > now.getTime();
    }
    return false;
}

function getRecorderBasedir() {
    const folder = osHomedir() + "/tunein-recorder/";
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

function startScheduledDownload(streamIndex) {
    if (model.streams[streamIndex]) {    
        const filePath = getFilePath(model.streams[streamIndex].stream)      
        downloadTo(filePath, model.streams[streamIndex].stream, streamIndex);        
        $("#status" + streamIndex).html('Running');
        setTimeout(function() {
            stopDownload(streamIndex);
            model.streams[streamIndex] = null;
            $("#status" + streamIndex).html('Finished');
        }, model.streams[streamIndex].duration * 60 * 1000);
    }
}

function deleteSchedule(streamIndex) {
    const scheduledStream = model.streams[streamIndex];
    if (scheduledStream.stream.request) {
        stopDownload(streamIndex);        
    }
    $("#schedule" + streamIndex).remove();
    model.streams[streamIndex] = null;
    storeSchedules();
}

function stopDownload(streamIndex) {          
    var runningStream = model.streams[streamIndex].stream;
    runningStream.request.abort();    
    const downloadIndex = downloadedStreams.length;
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

function startDownload(possibleStreamIndex) {
    const stream = {stream: possibleStreams[possibleStreamIndex], index: possibleStreamIndex};
    const streamIndex = model.streams.length;
    model.streams[streamIndex] = stream;   
    var storedFilePath = getFilePath(stream.stream);            
    downloadTo(storedFilePath, stream.stream);
    switchToCancelButton(possibleStreamIndex, streamIndex);
}

function downloadTo(storedFilePath, stream) {    
    var file = fs.createWriteStream(storedFilePath);
    stream.request = downloadWithRetry(stream.url, file);        
    stream.path = storedFilePath;    
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
            download(url, file, requestWrapper, currentCount + 1);
        }                
    });
    requestWrapper.request = request;
}

function switchToStartButton(possibleIndex) {
    $("#toggleButton" + possibleIndex).attr('onclick', "startDownload($(this).attr('index'));");
    $("#toggleButton" + possibleIndex).html('Start download');
}

function switchToCancelButton(possibleIndex, streamIndex) {
    $("#toggleButton" + possibleIndex).attr('onclick', "onClickCancel(" + possibleIndex + ", " + streamIndex + ");");
    $("#toggleButton" + possibleIndex).html('Stop download');
}

function onClickCancel(possibleIndex, streamIndex) {    
    switchToStartButton(possibleIndex);
    stopDownload(streamIndex);    
}

function nextIndex() {
    return model.currentIndex++;
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
    later.date.localTime();
    loadSchedules();
});

function storeSchedules() {        
    fs.writeFile(getSchedulesFile(), JSON.stringify(model, (key, value) => {
        return key === "request" ? undefined : value;
    }), function(err) {
        if(err) {
            window.alert("Could not save schedule. Schedule will not work after this program is restarted.");
            onFatalError(err);
        }    
    }); 
}

function loadSchedules() {
    if (!fs.existsSync(getSchedulesFile())) {
        console.log("No schedules found.");
        return;
    }
    fs.readFile(getSchedulesFile(), function (err, data) {
        if (err) {
            window.alert("Could not load schedules.");
            onFatalError(err);
        }
        try {
            if (data && data.length > 0) {
                model = JSON.parse(data.toString());                                
                reloadSchedules();
                storeSchedules();
                startSchedules();
            }
        } catch (e) {
            console.error(e, e.stack);
            showError("Could not load schedules");
        }             
    });
}

function startSchedules() {    
    model.streams.forEach((stream, index) => {
        later.setInterval(() => {
            startScheduledDownload(index);
        }, stream.schedule);       
    });
}

function reloadSchedules() {
    $("#scheduleTable").empty();
    model.streams = model.streams.filter(stream => stream != undefined && stream.schedule);
    model.streams.forEach(stream => stream.startTime = new Date(Date.parse(stream.startTime)));
    model.streams.forEach(stream => setNextStartTime(stream) );
    model.streams.sort((left, right) => left.startTime.getTime() > right.startTime.getTime());    
    model.streams.forEach((stream, index) => appendScheduleEntry(stream, index) );
}

function setNextStartTime(stream) { 
    if (stream.type === 'weekly') {
        while (stream.startTime.getTime() < new Date().getTime()) {
            stream.startTime = new Date(stream.startTime.getTime() + 1000 * 60 * 60 * 24 * 7);
        }
    } else if (stream.type === 'daily') {
        while (stream.startTime.getTime() < new Date().getTime()) {
            stream.startTime = new Date(stream.startTime.getTime() + 1000 * 60 * 60 * 24);
        }
    }
}


function getSchedulesFile() {
    return getRecorderBasedir() + "schedules.json";
}

$(document).ajaxStop(function() {
    hideLoadingAnimation();
});

$(document).ajaxError((event, jqxhr, settings, thrownError) => showError('Could not load page ' + settings.url));

function onClickReset() {
    if (confirm("This will remove all schedules and stop all downloads. Are you sure?")) {
        model.streams = [];
        storeSchedules();
        location.reload();
    }
}