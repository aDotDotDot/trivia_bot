const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./quiz.db');

const getRandomQuestion = () => {
    return new Promise((resolve, reject) => {
        db.get("select COUNT(*) as nb FROM questions;", (err, row)=>{
            if(err)
                reject(err);
            const rdmId = Math.floor(Math.random() * row['nb']);
            db.all(`SELECT c.category, q.question, q.level, a.answer, a.isGood FROM questions q 
            LEFT JOIN answers a ON a.id_question = q.id 
            LEFT JOIN categories c on c.id = q.id_category 
            WHERE q.id = ?`, rdmId, (rr,rows) =>{
                if(rr)
                    reject(rr);
                let obj = {category: rows[0]['category'],
                           question: rows[0]['question'],
                           answers: [],
                           goodAnswer: 0,
                           level: rows[0]['level']
                        };
                for(let i = 0; i < rows.length; i++){
                    obj.answers.push(rows[i]['answer']);
                    if(rows[i]['isGood'] == 1)
                        obj.goodAnswer = i;
                }
                resolve(obj);
            });
        });
    });
}
const emojis = ['\uD83C\uDDE6','\uD83C\uDDE7','\uD83C\uDDE8','\uD83C\uDDE9'];
const questionToEmbed = (q) => {
    let emb = new Discord.RichEmbed()
            .setColor('#0099ff')
            .setTitle(`Catégorie : ${q.category}`)
            .setFooter(`Cette question vaut ${q.level} point${q.level>1?'s':''}`);
    let desc = `${q.question}\n`
    for(let i = 0; i < q.answers.length; i++){
        desc += `${emojis[i]} ${q.answers[i]}\n`;
    }
    emb.setDescription(desc);
    return emb;
};

const accountForPoints = (q, goodAnswer, collected, botId) => {
    let users = new Map();
    collected.forEach( (v,k) => {
        v.users.forEach( (u,uid) => {
            if(uid != botId){
                if(!users.has(uid))
                    users.set(uid,[]);
                let t = users.get(uid);
                t.push(emojis.indexOf(k));
                users.set(uid,t);
            }
        });
    });
    res = new Map();
    users.forEach( (v,k)=>{
        if(v.length == 1){//on ne compte pas les réponses multiples
            if(v[0]==goodAnswer)
                res.set(k, q.level);//on ajoute des points correspondants au niveau de difficulté
        }
    });
    return res;
};

const savePointsToDB = (points) => {
    points.forEach( (v,k)=>{
        db.get("select COUNT(*) as nb FROM players WHERE discord_user_id = ?;",[k], (err,row)=>{
            if(err)
                console.log(err);
            else{
                if(row.nb == 1){
                    db.run(`UPDATE players SET points=points+${v} WHERE discord_user_id = ?`, [k]);
                }else{
                    db.run(`INSERT INTO players(discord_user_id,points) VALUES (?,?)`, [k,v]);
                }
            }
        });
    });
};

const leaderBoard = () => {
    return new Promise((resolve, reject)=>{
        db.all("SELECT * FROM players ORDER BY points DESC LIMIT 15", (err, rows)=>{
            if(err)
                reject(err);
            resolve(rows);
        });
    });
}
//leaderBoard().then(console.log)
const Discord = require('discord.js');
const auth = require('./auth.json');

// Initialize Discord Bot
const bot = new Discord.Client();
let inQuizz = false;
/* Bot stuff, creating ready event*/
bot.on('ready', (evt) => {
    console.log('Connected');
    console.log('Logged in as: ');
    console.log(bot.user.username + ' - (' + bot.user.id + ')');
});
bot.on('disconnect', (evt) => {
    bot.login(auth.token);
});
bot.on('error', console.error);

bot.on('message', (message) => {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `prefix`
    let prefix = ["µ",'\u03BC'];
    if(message.author.id == bot.user.id)
        return;
    if (prefix.includes(message.content.substring(0, 1))) {   
        let args = message.content.substring(1).split(' ');
        let cmd = args[0];
        args = args.splice(1);
        switch(cmd) {
            case 'quizz':
                if(!inQuizz){
                    getRandomQuestion().then( r => {
                        goodAnswer = r.goodAnswer;
                        message.channel.send(questionToEmbed(r)).then( (msg)=> {
                            inQuizz = true;
                            msg.react(emojis[0]).then(()=>{
                                msg.react(emojis[1]).then(()=>{
                                    msg.react(emojis[2]).then(()=>{
                                        msg.react(emojis[3]).then(()=>{
                                            let filter = (reaction, user) => {
                                                return user.id != bot.user.id && emojis.includes(reaction.emoji.name);
                                            };
                                            let collector = msg.createReactionCollector(filter, { time: 10000 });
                                            collector.on('collect', (reaction, thisCollector) => {
                                                reaction.users.map( (user) => {
                                                    if(user.id == bot.user.id) return;
                                                    //console.log(user.id);
                                                });
                                            });
                                            collector.on('end', (collected, reason) => {
                                                let ga = accountForPoints(r, goodAnswer, collected, bot.user.id);
                                                savePointsToDB(ga);
                                                message.channel.send(`La réponse était ${emojis[goodAnswer]} ${r.answers[goodAnswer]}`);
                                                if(ga.size>0){
                                                    let pa = []
                                                    ga.forEach( (v,k)=>{
                                                        pa.push(message.guild.members.find(user => user.id == k));
                                                    });
                                                    let players = pa.reduce( (a,e)=>{
                                                        a += `${e} `;
                                                        return a;
                                                    },``);
                                                    message.channel.send(`Bravo à ${players.substring(0,players.length-1)}, qui gagne${ga.size>1?'nt':''} ${r.level} point${r.level>1?'s':''}`);
                                                }else{
                                                    message.channel.send(`Personne n'a trouvé`);
                                                }
                                                //message.guild.members.find(user => user.id == k)
                                                inQuizz = false;
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                }
            break;
            case 'leaderquizz':
                leaderBoard().then((r)=>{
                    //console.log(message.guild.members.find(user => user.id == '123'))
                    let cpt=1;
                    let emb = new Discord.RichEmbed()
                                    .setColor('#0099ff')
                                    .setTitle(`Leaderboard`);
                    let msg='';
                    r.forEach(e=>{
                        let u = message.guild.members.find(user => user.id == e.discord_user_id);
                        if(u){
                            msg += `${cpt}. ${u} : ${e.points} point${e.points>1?'s':''}\n`;
                            cpt++;
                        }
                        emb.setDescription(msg);
                    });
                    message.channel.send(emb);
                })
            break;
        }
    }
});

bot.login(auth.token);
