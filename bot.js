const Discord = require('discord.js');
const client = new Discord.Client();
const ytdl = require('ytdl-core');
const auth = require('./auth.json');
const prefix = require('./prefix.json');


client.login(auth.key);

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

//bot在discord登入


//對話系統
client.on('message', msg => {

    try {
        if (!msg.guild || !msg.member) return; //訊息內不存在guild元素 = 非群組消息(私聊)
        if (!msg.member.user) return; //幫bot值多拉一層，判斷上層物件是否存在
        if (msg.member.user.bot) return; //訊息內bot值為正 = 此消息為bot發送
    } catch (err) {
        return;
    }

    //文字分析
    try {
        let tempPrefix = '-1';
        const prefixED = Object.keys(prefix); //前綴符號定義
        prefixED.forEach(element => {
            if (msg.content.substring(0, prefix[element].Value.length) === prefix[element].Value) {
                tempPrefix = element;
            }
        });

        //文字判斷並回復
        switch (tempPrefix) {
            case '0': //文字回應功能
                const cmd = msg.content.substring(prefix[tempPrefix].Value.length).split(' '); //以空白分割前綴以後的字串
                switch (cmd[0]) {
                    case 'hi':
                        msg.channel.send('hi');
                        break;
                    case 'help':
                        msg.channel.send('使用Z呼叫\n Zplay [網址] 播放影片\n Zreplay 重播\n Zskip 跳過\n Znp 當前歌曲功能\n Zqueue 當前排序\n Zdisconnect 斷線')
                        break;
                }
                break;
            case '1': //音樂指令
                MusicFunction(msg);
                break;
        }
    } catch (err) {
        console.log('OnMessageError', err);
    }
});


//音樂系統
let dispatcher;
//歌曲清單
let musicList = new Array();

function MusicFunction(msg) {
    //將訊息內的前綴字截斷
    const content = msg.content.substring(prefix[1].Value.length);
    //指定我們的間隔符號
    const splitText = ' ';
    //用間隔符號隔開訊息 contents[0] = 指令,contents[1] = 參數
    const contents = content.split(splitText);

    switch (contents[0]) {
        case 'play':
            //點歌&播放歌曲功能
            playMusic(msg, contents);
            break;
        case 'replay':
            //重播當前歌曲
            replayMusic(msg.channel.id);
            break;
        case 'np':
            //當前歌曲資訊
            nowPlayMusic(msg.channel.id);
            break;
        case 'queue':
            //歌曲清單
            queueShow(msg.channel.id);
            break;
        case 'skip':
            skipMusic(msg.channel.id);
            break;
        case 'disconnect':
            //退出語音頻道並且清空歌曲清單
            disconnectMusic(msg.guild.id, msg.channel.id);
            break;
    }
}

//Zplay 播放
async function playMusic(msg, contents) {
    //定義我們的第一個參數必需是網址
    const urlED = contents[1];
    try {
        //第一個參數不是連結就要篩選掉
        if (urlED.substring(0, 4) !== 'http') return msg.reply('該連結不可用');

        //透過library判斷連結是否可運行
        const validate = await ytdl.validateURL(urlED);
        if (!validate) return msg.reply('The link is not working.2');

        //獲取歌曲資訊
        const info = await ytdl.getInfo(urlED);
        //判斷資訊是否正常
        if (info.videoDetails) {
            //指令下達者是否在語音頻道
            if (msg.member.voice.channel) {
                //判斷bot是否已經連到語音頻道 是:將歌曲加入歌單 不是:進入語音頻道並且播放歌曲
                if (!client.voice.connections.get(msg.guild.id)) {
                    //將歌曲加入歌單
                    musicList.push(urlED);
                    //進入語音頻道
                    msg.member.voice.channel.join()
                        .then(connection => {
                            msg.channel.send(`${msg.member.voice.channel} 已抵達`);
                            const guildID = msg.guild.id;
                            const channelID = msg.channel.id;
                            //播放歌曲
                            playMusic2(connection, guildID, channelID);
                        })
                        .catch(err => {
                            msg.reply('bot進入語音頻道時發生錯誤，請再試一次');
                            console.log(err, 'playMusicError2');
                        })
                } else {
                    //將歌曲加入歌單
                    musicList.push(urlED);
                    msg.channel.send(`${info.videoDetails.title} 加入順列`);
                }
            } else return msg.reply('您不再該頻道');
        } else return msg.reply('The link is not working.3');
    } catch (err) {
        console.log(err, 'playMusicError');
    }
}

//Zplay 
async function playMusic2(connection, guildID, channelID) {
    try {
        //播放前歌曲清單不能沒有網址
        if (musicList.length > 0) {
            //設定音樂相關參數
            const info = await ytdl.getInfo(musicList[0]);
            message = `${info.videoDetails.title} 正在播放`;
            client.channels.fetch(channelID).then(channel => channel.send(message));
            const streamOptions = {
                seek: 0,
                volume: 0.5,
                Bitrate: 192000,
                Passes: 1,
                highWaterMark: 1
            };
            //讀取清單第一位網址
            const stream = await ytdl(musicList[0], {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 26214400 //25ms
            })

            //播放歌曲，並且存入dispatcher
            dispatcher = connection.play(stream, streamOptions);
            //監聽歌曲播放結束事件
            dispatcher.on("finish", finish => {
                //將清單中第一首歌清除
                if (musicList.length > 0) musicList.shift();
                //播放歌曲
                playMusic2(connection, guildID, channelID);
            })
        } else disconnectMusic(guildID, channelID); //清空歌單並且退出語音頻道
    } catch (err) {
        console.log(err, 'playMusic2Error');
    }
}

//Zdisconnect 離開頻道
function disconnectMusic(guildID, channelID) {
    try {
        //判斷bot是否在此群組的語音頻道
        if (client.voice.connections.get(guildID)) {
            //清空歌曲清單
            musicList = new Array();
            //退出語音頻道
            client.voice.connections.get(guildID).disconnect();

            client.channels.fetch(channelID).then(channel => channel.send('bye'));
        } else client.channels.fetch(channelID).then(channel => channel.send('您不再頻道'))
    } catch (err) {
        console.log(err, 'disconnectMusicError');
    }
}

//Zskip 跳過音樂
async function skipMusic(channelID) {

    const info = await ytdl.getInfo(musicList[0]);
    message = `${info.videoDetails.title} 跳過`;
    client.channels.fetch(channelID).then(channel => channel.send(message));
    if (dispatcher !== undefined) dispatcher.end();
}

//Zreplay 重播現音樂
async function replayMusic(channelID) {
    if (musicList.length > 0) {
        //把當前曲目再推一個到最前面
        musicList.unshift(musicList[0]);
        const info = await ytdl.getInfo(musicList[0]);
        message = `${info.videoDetails.title} 重播`;
        client.channels.fetch(channelID).then(channel => channel.send(message));
        //將歌曲關閉，觸發finish事件
        //finish事件將清單第一首歌排出，然後繼續播放下一首
        if (dispatcher !== undefined) dispatcher.end();
    }
}

//Zqueue 列隊查看
async function queueShow(channelID) {
    try {
        if (musicList.length > 0) {
            let info;
            let message = '';
            for (i = 0; i < musicList.length; i++) {
                //從連結中獲取歌曲資訊 標題 總長度等
                info = await ytdl.getInfo(musicList[i]);
                //歌曲標題
                title = info.videoDetails.title;
                //串字串
                message = message + `\n${i + 1}. ${title}`;
            }
            //把最前面的\n拿掉
            message = message.substring(1, message.length);
            client.channels.fetch(channelID).then(channel => channel.send(message))
        }
    } catch (err) {
        console.log(err, 'queueShowError');
    }
}

//Znp 現當撥放
async function nowPlayMusic(channelID) {
    try {
        if (dispatcher !== undefined && musicList.length > 0) {
            //從連結中獲取歌曲資訊 標題 總長度等
            const info = await ytdl.getInfo(musicList[0]);
            //歌曲標題
            const title = info.videoDetails.title;
            //歌曲全長(s)
            const songLength = info.videoDetails.lengthSeconds;
            //當前播放時間(ms)
            const nowSongLength = Math.floor(dispatcher.streamTime / 1000);
            //串字串
            const message = `${title}\n${streamString(songLength, nowSongLength)}`;
            client.channels.fetch(channelID).then(channel => channel.send(message));


        }
    } catch (err) {
        console.log(err, 'nowPlayMusicError');
    }
}

//Znp 進度條
function streamString(songLength, nowSongLength) {
    let mainText = '▶';
    const secondText = '▬';
    const whereMain = Math.floor((nowSongLength / songLength) * 100);
    let message = '';
    for (i = 1; i <= 30; i++) {
        if (i * 3.3 + 1 >= whereMain) {
            message = message + mainText;
            mainText = secondText;
        } else {
            message = message + secondText;
        }
    }
    return message;
}