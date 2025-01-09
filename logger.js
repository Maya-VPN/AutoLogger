const mysql = require('mysql');
const http = require('http');
const mysql2 = require('mysql2/promise');
const axios = require('axios');
const schedule = require('node-schedule');
const FormData = require('form-data');

const dbConfig = {
    host: "localhost",
    user: "mayahost_url_test",
    password: "yqH%Q~nmi~+@",
    database: "mayahost_sm3"
};

var database = null;

const connection = mysql.createConnection(dbConfig);

connection.connect(function (err) {
    if (err) {
        console.error("Error connecting to database:", err);
        return;
    }
    setInterval(updateOnlineUsers, 300000);
    updateOnlineUsers();
    setInterval(updateServerDataUsage, 3600000);
    updateServerDataUsage();

    // updateUsersFromIbsng();

    (async function run() {

        database = await mysql2.createConnection(dbConfig);
        updateUsedDataVClient();


        const job = () => {
            console.log('This task is executed every 3 days at 4 AM');

            runRefinementV2rayServers();

        };

        schedule.scheduleJob('0 4 */3 * *', job);
        runRefinementV2rayServers();


        runUpdateSize();


    })()


    console.log("auto logger started");
});

function updateOnlineUsers() {
    try {
        const query = "INSERT INTO online_logs (online_users) SELECT COUNT(*) AS online_users FROM sessions ses WHERE ses.is_online = 1 OR ses.last_check >= DATE_SUB(NOW(), INTERVAL 5 MINUTE);";

        connection.query(query, function (err, result) {
            if (err) {
                console.error("Error executing query:", err);
                return;
            }
            console.log("Online users updated:", result.affectedRows);
        });
    } catch (e) {
        console.log("error update online user : ", e);
    }
}

function updateServerDataUsage() {
    try {
        const query = "INSERT INTO logs (type, data, sub_id) SELECT 1, COALESCE(SUM(value) - ( SELECT SUM(data) FROM logs WHERE sub_id = sessions_data.server_id GROUP BY sub_id ),0) , server_id FROM sessions_data INNER JOIN servers ON servers.ID = sessions_data.server_id GROUP BY server_id;";

        connection.query(query, function (err, result) {
            if (err) {
                console.error("Error executing query:", err);
                return;
            }

            console.log("updateServerDataUsage:", result.affectedRows);

        });
    } catch (e) {
        console.log("error update online user : ", e);
    }
}

// function updateUsersFromIbsng() {
//     console.log("==============================================")
//     var options = {
//         host: "https://app.mayaconn.com",
//         path: '/v3/admin/testing/check_expiry_all_users.php',
//         method: 'POST'
//     };
//
//     http.request(options, function (res) {
//         console.log('STATUS: ' + res.statusCode);
//         console.log('HEADERS: ' + JSON.stringify(res.headers));
//         res.setEncoding('utf8');
//         res.on('data', function (chunk) {
//             console.log('BODY: ' + chunk);
//             updateUsersFromIbsng();
//         });
//     }).end();
//
//
// }

async function runUpdateSize() {
    console.log("runUpdateSize");

    try {
        const qServers = await database.query("WITH sessionClientData AS( SELECT cv.session_id, (-1 * SUM(cv.up + cv.down)) usedData FROM v2ray_client cv GROUP BY cv.session_id ), sessionData AS( SELECT sd.session_id, SUM(sd.value) usedData FROM sessions_data sd GROUP BY sd.session_id ), userData AS( SELECT ud.user_id, SUM(ud.value) usedData FROM user_data ud GROUP BY ud.user_id ), vClientSessions AS( SELECT vc.*, ( SELECT ( ig.usable_data -( -1 * ABS(COALESCE(ud.usedData, 0)) ) + SUM( COALESCE(sd.usedData, 0) +( SELECT SUM(COALESCE(usedData, 0)) FROM sessionClientData WHERE session_id = ses2.ID ) ) ) usableData FROM `sessions` ses2 INNER JOIN `ibsng_users` usr ON usr.UserId = ses2.user_id LEFT JOIN `ibsng_groups` ig ON ig.Name = usr.GroupName LEFT JOIN userData ud ON ud.user_id = usr.ID LEFT JOIN sessionClientData scd ON scd.session_id = ses2.ID LEFT JOIN sessionData sd ON sd.session_id = ses2.ID WHERE usr.UserId = ses1.user_id ) AS usableData FROM `v2ray_client` vc INNER JOIN `sessions` ses1 ON ses1.ID = vc.session_id WHERE vc.status = 1 ) SELECT vs.*, JSON_ARRAYAGG(DISTINCT vss.inbound_id) inbounds, ( JSON_ARRAYAGG( DISTINCT JSON_OBJECT( 'client_id', vc.ID, 'usableData', vc.usableData, 'settings', vc.settings ) ) ) clients FROM `v2ray_server` vs INNER JOIN `v2ray_sample_server` vss ON vss.v2ray_address_id = vs.ID LEFT JOIN vClientSessions vc ON vc.v2ray_sample_server_id = vss.ID WHERE vc.status = 1 AND ( SELECT COUNT(*) FROM `sessions` ses1 WHERE ses1.user_id = ( SELECT user_id FROM `sessions` WHERE ID = vc.session_id ) AND ses1.is_active = 1 ) > 0 GROUP BY vs.ID;", []);
        const servers = qServers[0];
        for (const server of servers) {


            console.log(`===================================================================== servers - ${server.label} => `);

            if (server.clients !== null && server.clients !== undefined && server.clients !== "") {

                const clients = JSON.parse(server.clients);

                try {

                    console.log("---------------------------------------------------- getting Clients From Server");
                    // console.log(`clients : ${clients.length}`)
                    const result = await getClientsFromServer(server);
                    console.log(`result Clients From Server ${result.success} , ${result.obj === null ? -1 : result.obj.length} `);
                    // console.log(result);


                    if (result.success) {

                        console.log("------------------------------------------------ getting Online Clients From Server");
                        const resultOnlineClients = await getOnlineClients(server)

                        const inbounds = result.obj;
                        console.log('-----------------server.inbounds : ')
                        console.log(server.inbounds);

                        for (const inbound1 of server.inbounds) {

                            console.log(`-------------------------------------------------------------------- inbound1 id : ${inbound1} => `)

                            for (let j = 0; j < inbounds.length; j++) {
                                const inbound2 = inbounds[j];

                                console.log(`-------------------------------------------------------- inbound2 ${inbound2.id} => `)

                                // if (inbound)

                                for (let k = 0; k < inbound2.clientStats.length; k++) {
                                    const clientSer = inbound2.clientStats[k];

                                    console.log(`---------------------------------------------------- clientSer ${clientSer.email}=> `)
                                    console.log(clients)

                                    for (const client of clients) {

                                        const email = JSON.parse(JSON.parse(client.settings)[0].settings).clients[0].email;
                                        const clientTokenId = JSON.parse(JSON.parse(client.settings)[0].settings).clients[0].id;
                                        const clientId = client.client_id;

                                        console.log(`----------------- ----------- client  ${clientSer.email} ===  ${email} : ${clientSer.email === email}`)
                                        console.log(client)

                                        // if (clientSer !== null && email === clientSer.email) {
                                        //     let isOnline = false;
                                        //     for (emailOnline of resultOnlineClients.obj) {
                                        //         if (email === emailOnline) {
                                        //             isOnline = true;
                                        //             break
                                        //         }
                                        //     }
                                        //     console.log(`email : ${email} , inbound : ${inbound1} , client : ${JSON.stringify(clientSer)} , ${isOnline}`);
                                        //
                                        //     if (isOnline) {
                                        //         const up = (clientSer.up === null || clientSer.up === '') ? 0 : (parseInt(clientSer.up));
                                        //         const down = (clientSer.down === null || clientSer.down === '') ? 0 : (parseInt(clientSer.down));
                                        //
                                        //
                                        //         await database.query("UPDATE `v2ray_client` SET `up`=?,`down`=?,`update_used_data`=NOW() WHERE ID = ?", [up, down, clientId]);
                                        //         client.totalGB = client.usableData;
                                        //         client.id = clientTokenId;
                                        //         client.email = email;
                                        //         client.subId = clientSer.subId === null || clientSer.subId === undefined ? "" : clientSer.subId;
                                        //         client.tgId = "";
                                        //         client.enable = clientSer.enable;
                                        //         client.expiryTime = clientSer.expiryTime;
                                        //         await updateClient(server, inbound1, client);
                                        //
                                        //     }
                                        //
                                        // }


                                    }

                                }
                            }

                        }

                    }

                } catch (e) {

                }
            }
        }
    } catch (e) {
        console.error(e);
    }
    setTimeout(() => {
        runUpdateSize()
    }, 30000)
}

async function runRefinementV2rayServers() {

    const sampleServers = await database.query("WITH vClientSessions AS ( SELECT vc.* FROM v2ray_client vc LEFT JOIN sessions ses ON ses.ID = vc.session_id WHERE vc.status IN (1,2) AND ( ses.last_check < NOW() - INTERVAL 1 WEEK AND ses.modifi_date < NOW() - INTERVAL 1 WEEK )) SELECT vss.ID,vss.v2ray_address_id,vss.inbound_id , vss.refinement_at , vss.status , vs.address , vs.login_port, vs.cookie , JSON_ARRAYAGG(DISTINCT JSON_OBJECT('client_id',vc.ID ,'settings',vc.settings ) ) clients , vc.session_id FROM `v2ray_sample_server` vss INNER JOIN `v2ray_server` vs ON vs.ID = vss.v2ray_address_id LEFT JOIN vClientSessions vc ON vc.v2ray_sample_server_id = vss.ID WHERE CHAR_LENGTH(vs.cookie) > 2 GROUP BY vss.v2ray_address_id AND refinement_at < NOW() - INTERVAL 7 DAY;", []);
    console.log("=========================================================================servers =>")
    console.log(sampleServers[0])
    for (const server of sampleServers[0]) {
        // let inbounds = await getClientsFromServer(server);
        // const clientsForThisServer = inbounds.filter((client)=>{return server.inbound_id === client.v2ray_address_id});
        const clients = JSON.parse(server.clients)
        try {
            const result = await getClientsFromServer(server);
            if (result.success) {
                const inbounds = result.obj;
                // console.log(`server : ${server.address} ,inbounds : ${inbounds.length}`);
                for (let j = 0; j < inbounds.length; j++) {
                    const inbound = inbounds[j];
                    // if (inbound)
                    // console.log(`clientsForThisInbounds : ${JSON.stringify(clientsForThisInbounds)} }`);

                    for (let k = 0; k < inbound.clientStats.length; k++) {
                        const clientSer = inbound.clientStats[k];

                        for (let g = 0; g < clients.length; g++) {
                            const client = clients[g];

                            // [{"id":7,"settings":"{\"clients\":[{\"id\":\"672749c3b72dd\",\"alterId\":0,\"email\":\"androidtestserver-207127\",\"limitIp\":0,\"totalGB\":0,\"expiryTime\":1732167780000,\"enable\":true,\"tgId\":\"\",\"subId\":\"\"}]}"}]
                            // console.log(`client equal: ${client.email} , ${clientSer.email} , ${client.email === clientSer.email} , ${clientsForThisInbounds.length}`);
                            if (client.settings !== null && client.settings.length > 0) {
                                const settings = JSON.parse(JSON.parse(client.settings)[0].settings)
                                if (settings.clients !== null && settings.clients.length > 0) {

                                    const email = settings.clients[0].email;
                                    const clientId = client.client_id;

                                    if (clientSer !== null && email === clientSer.email) {

                                        let resultDelete = await deleteClient(server, clientSer);
                                        let status = 2;

                                        const up = (clientSer.up === null || clientSer.up === '') ? 0 : (parseInt(clientSer.up));
                                        const down = (clientSer.down === null || clientSer.down === '') ? 0 : (parseInt(clientSer.down));

                                        if (resultDelete === null || resultDelete.success === true) {
                                            status = 3;
                                        }

                                        await database.query("UPDATE `v2ray_client` SET `up`=?,`down`=?,`update_used_data`=NOW(),`status`=? WHERE ID = ?", [up, down, status, clientId]);

                                    }

                                }

                            }


                        }

                    }
                }
            }
            // console.log(`server : ${JSONserver.address}  =>  `)
            // console.log(result)
        } catch (error) {
            console.error('Error sending request:', error);
        }

    }
    console.log("============================================================================")

}

async function updateUsedDataVClient() {
    //=============== create queue for check clients from servers
    //queue
    // get all active servers and inbound
    const queryServers = "SELECT vss.ID sampleServerId,vss.v2ray_address_id,vs.cookie , vs.address,vs.login_port , vss.inbound_id,vc.settings from `v2ray_client` vc INNER JOIN `v2ray_sample_server` vss ON vss.ID = vc.v2ray_sample_server_id LEFT JOIN `v2ray_server` vs ON vs.ID = vss.v2ray_address_id WHERE vc.status = 1 GROUP BY vs.ID ;";
    const queryClients = "SELECT vc.ID,vc.v2ray_sample_server_id sampleServerId, vss.inbound_id , vss.v2ray_address_id ,vc.session_id, TRIM(BOTH \'\\\"\' FROM (JSON_EXTRACT(TRIM(BOTH \'\\\"\' FROM (REPLACE(JSON_EXTRACT(vc.settings,\"$[0].settings\"),\"\\\\\",\'\'))),\"$.clients[0].email\"))) email FROM `v2ray_client` vc INNER JOIN `v2ray_sample_server` vss ON vss.ID = vc.v2ray_sample_server_id WHERE vc.status = 1 ORDER BY ID DESC;";
    const resServers = await database.query(queryServers, []);
    const allServers = resServers[0];
    const resClients = await database.query(queryClients, []);
    const allClients = resClients[0];
    // console.log(`resServers : ${JSON.stringify(allServers)}`)
    // console.log(`allClients : ${JSON.stringify(allClients)}`)
    for (let i = 0; i < allServers.length; i++) {


        const server = allServers[i];
        const clientsForThisServer = allClients.filter((client) => {
            return server.v2ray_address_id === client.v2ray_address_id
        });
        // Get all used data from servers :
        try {
            const result = await getClientsFromServer(server);
            if (result.success) {
                const inbounds = result.obj;
                // console.log(`server : ${server.address} ,inbounds : ${inbounds.length}`)
                for (let j = 0; j < inbounds.length; j++) {
                    const inbound = inbounds[j];
                    const clientsForThisInbounds = clientsForThisServer.filter((client) => {
                        return client.inbound_id === inbound.id
                    })
                    // console.log(`clientsForThisInbounds : ${JSON.stringify(clientsForThisInbounds)} }`)

                    for (let k = 0; k < inbound.clientStats.length; k++) {
                        const clientSer = inbound.clientStats[k];

                        for (let g = 0; g < clientsForThisInbounds.length; g++) {
                            const client = clientsForThisInbounds[0];
                            // const sessionId = client.session_id ;
                            // const session = await database.query("WITH sessionClientData AS ( SELECT cv.session_id , (-1 * SUM(cv.up+cv.down)) usedData FROM v2ray_client cv GROUP BY cv.session_id ), sessionData AS (  SELECT sd.session_id , SUM(sd.value) usedData FROM sessions_data sd GROUP BY sd.session_id  ),  userData AS (  SELECT ud.user_id , SUM(ud.value) usedData FROM user_data ud GROUP BY ud.user_id  )    SELECT   usr.ID ,  usr.UserId ,   usr.Username ,   usr.unique_token ,   usr.MultiLogin,  usr.logged_in_count ,   usr.GroupName ,  usr.selected_def_v2ray_id,  usr.FirstLogin ,  usr.ExpiryDate ,   usr.selected_def_v2ray_id ,   usr.is_active ,  usr.is_blocked ,   usr.update_at ,  usr.created_at ,   (DATEDIFF(usr.ExpiryDate , NOW())) remaining_time ,  (COALESCE(ud.usedData,0)) uData ,  SUM(COALESCE(scd.usedData,0)) scData,  SUM(COALESCE(sd.usedData,0)) sData , (-1* ABS(((COALESCE(ud.usedData,0)) + SUM(COALESCE(scd.usedData,0)) + SUM(COALESCE(sd.usedData,0)))))UsedData ,  (ig.usable_data)UsableData  ,  SUM(CASE WHEN ses.is_active = 1 AND (ses.is_online OR ses.modifi_date > NOW() - INTERVAL 5 MINUTE)  THEN 1 ELSE 0 END)OnlineSessions ,  SUM(CASE WHEN ses.is_active = 1 THEN 1 ELSE 0 END) active_sessions   FROM `sessions` ses   INNER JOIN `ibsng_users` usr ON usr.UserId = ses.user_id  LEFT JOIN ibsng_groups ig ON ig.Name = usr.GroupName  LEFT JOIN userData ud ON ud.user_id = usr.ID  LEFT JOIN sessionClientData scd ON scd.session_id = ses.ID   LEFT JOIN sessionData sd ON sd.session_id = ses.ID  WHERE usr.UserId =  (SELECT user_id FROM sessions ses WHERE ses.ID = ? LIMIT 1) ;", [sessionId]);
                            // console.log(`client equal: ${client.email} , ${clientSer.email} , ${client.email === clientSer.email} , ${clientsForThisInbounds.length}`)
                            if (client.email === clientSer.email) {
                                clientSer.id = client.ID
                                await updateClientState(database, clientSer);
                            }

                        }

                    }
                }
            }
        } catch (error) {
            console.error('Error sending request:', error);
        }
    }
    setTimeout(async () => {
        updateUsedDataVClient()
    }, 300000);


    return;
}

async function updateClientState(database, client) {
    await database.query("UPDATE `v2ray_client` SET up = ? , down = ? , update_used_data = NOW() WHERE ID = ?", [(client.up === null || client.up === '') ? 0 : parseInt(client.up), (client.down === null || client.down === '') ? 0 : parseInt(client.down), client.id]);
}

async function getOnlineClients(server) {


    let cookieString = '';
    const cookie = JSON.parse(server.cookie);
    const keys = Object.keys(cookie);
    keys.forEach((key) => {
        cookieString += `${key}=${cookie[key]};`
    });

    const url = new URL("http://" + server.address + `/panel/inbound/onlines`)
    url.port = server.login_port;
    console.log(`get onlines client server from : ${url.toString()}`);
    try {
        const {data} = await axios.post(url, {}, {
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                Cookie: cookieString
            }
        });
        console.log(`success getOnlineClients: ${JSON.stringify(data)}`)
        return data;
    } catch (e) {
        console.log("Error get client : ", e)
        return new Promise.resolve(null)
    }
}

async function getClientsFromServer(server) {


    let cookieString = '';
    const cookie = JSON.parse(server.cookie);
    const keys = Object.keys(cookie);
    keys.forEach((key) => {
        cookieString += `${key}=${cookie[key]};`
    });
    const url = new URL("http://" + server.address + `/panel/api/inbounds/list`)
    url.port = server.login_port;
    console.log(`get client server from : ${url.toString()}`);

    try {
        const {data} = await axios.get(url.toString(), {
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                Cookie: cookieString
            }
        });
        // console.log(`success getClients: ${JSON.stringify(data)}`)
        return data;
    } catch (e) {
        console.log("Error get client : ", e)
        return null
    }
}

async function deleteClient(server, client) {


    let cookieString = '';
    const cookie = JSON.parse(server.cookie);
    const keys = Object.keys(cookie);
    const clientUUID = client.id;

    keys.forEach((key) => {
        cookieString += `${key}=${cookie[key]};`
    });

    const url = new URL("http://" + server.address + `/panel/api/inbounds/${server.inbound_id}/delClient/${clientUUID}`)
    url.port = server.login_port;
    try {
        const {data} = await axios.get(url, {
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                Cookie: cookieString
            }
        });
        console.log(`success : ${JSON.stringify(data)}`)
        return data;
    } catch (e) {
        console.log("Error get client : ", e)
        return null
    }


}

async function updateClient(server, inboundId, client) {


    let cookieString = '';
    const cookie = JSON.parse(server.cookie);
    const keys = Object.keys(cookie);
    const clientUUID = client.id;

    keys.forEach((key) => {
        cookieString += `${key}=${cookie[key]};`
    });

    const url = new URL("http://" + server.address + `/panel/inbound/updateClient/${clientUUID}`)
    url.port = server.login_port;

    try {

        const requestData = {
            id: inboundId,
            settings: JSON.stringify({
                clients: [{
                    id: client.id,
                    flow: "",
                    email: client.email,
                    limitIp: 0,
                    totalGB: parseInt(client.totalGB),
                    expiryTime: parseInt(client.expiryTime),
                    enable: client.enable === true,
                    tgId: client.tgId,
                    subId: client.subId,
                    reset: 0,
                    alterId: 0,
                }]
            })
        };
        console.log(`requestData : ${JSON.stringify(requestData)}`)

        const {data} = await axios.post(url, requestData, {

            headers: {
                "Accept": "*/*",
                "Content-Type": "application/json;",
                Cookie: cookieString
            },

        });
        console.log(`success update client : ${JSON.stringify(data)}`)
        return data;
    } catch (e) {
        console.log("Error get client : ", e)
        return null
    }


}


// async function getInboundsFromServer(server) {
//     console.log(`get inbounds server from : http://${server.address}:${server.login_port}/panel/api/inbounds/get/${server.inbound_id}`);
//     let cookieString = '';
//     const cookie = JSON.parse(server.cookie);
//     const keys = Object.keys(cookie);
//     keys.forEach((key) => {
//         cookieString += `${key}=${cookie[key]};`
//     });
//     const url = `http://${server.address}:${server.login_port}/panel/api/inbounds/list`;
//     try {
//         const {data} = await axios.get(url, {
//             headers: {
//                 "Content-Type": "application/json; charset=UTF-8",
//                 Cookie: cookieString
//             }
//         });
//         return data;
//     } catch (e) {
//         console.log("Error get client : ",e)
//         return new Promise.resolve(null)
//     }
// }