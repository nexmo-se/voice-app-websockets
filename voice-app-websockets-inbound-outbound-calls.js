'use strict'

//-------------

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser')
const app = express();

app.use(bodyParser.json());

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//-------

const servicePhoneNumber = process.env.SERVICE_PHONE_NUMBER;
console.log("Service phone number:", servicePhoneNumber);

//--- Vonage API ---

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

const apiBaseUrl = "https://" + process.env.API_REGION;

const options = {
  apiHost: apiBaseUrl
};

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials, options);

// Use for direct REST API calls - Sample code
// const appId = process.env.APP_ID; // used by tokenGenerate
// const privateKey = fs.readFileSync('./.private.key'); // used by tokenGenerate
// const { tokenGenerate } = require('@vonage/jwt');

//-------------------

// Middleware server
const processorServer = process.env.PROCESSOR_SERVER;

// Test 2nd party phone number
const pstnCalleeNumber = process.env.PSTN_CALLEE_NUMBER;

//------------------------------------

let uuids = {}; // map necessary data to customer leg uuid

function addToUuids(uuid) {   // uuid of first leg (customer leg uuid)

  uuids[uuid] = {};
  // uuids[uuid]['user_id_1'] = null;  // customer leg user-ID
  uuids[uuid]['ws_uuid_1'] = null; // corresponding customer websocket uuid
  uuids[uuid]['uuid_2'] = null;     // agent leg uuid
  // uuids[uuid]['user_id_2'] = null;  // agent leg user-ID
  uuids[uuid]['ws_uuid_2'] = null; // corresponding agent websocket uuid
  uuids[uuid]['from'] = null;     // caller party info
  uuids[uuid]['to'] = null; // called party info
}

function removeFromUuids(uuid) {
  delete uuids[uuid];
  console.log ("uuids dictionary:", uuids); 
}

//============= Processing inbound PSTN calls ===============

app.get('/answer', async(req, res) => {     // PSTN 1 leg

  const uuid = req.query.uuid;

  //--

  addToUuids(uuid);
  uuids[uuid]['from'] = req.query.from;
  uuids[uuid]['to'] = req.query.to;

  //--

  const nccoResponse = [
    {
      "action": "talk",
      "text": "Thank you for calling your preferred provider. Please wait while we are connecting your call to the remote party.",
      "language": "en-US", 
      "style": 11
    },
    {
      "action": "conversation",
      "name": "conf_" + uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

  const hostName = req.hostname;
  const uuid = req.body.uuid;

  //--

  if (req.body.type == 'transfer') {

    const wsUri = 'wss://' + processorServer + '/socket?user=customer&webhook_url=https://' + hostName + '/analytics'; 
    console.log('>>> WebSocket URI:', wsUri);

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
        headers: {
        // pass here your own custom data, will be received as initial text message on the other end of this WebSocket
          entity_type: "customer",
          // entity_id: uuids[uuid]['user_id_1']
          interaction_id: "i_" + uuid, // as an example
          ani: uuids[uuid]['from'],
          dnis: uuids[uuid]['to']
        }
      }],
      from: {
        type: 'phone',
        number:  19992550101 // value does not matter
      },
      answer_url: ['https://' + hostName + '/ws_answer_1?original_uuid=' + uuid + '&webhook_url=https://' + hostName + '/analytics'],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_1?original_uuid=' + uuid + '&webhook_url=https://' + hostName + '/analytics'],
      event_method: 'POST'
      })
    .then(res => {
      uuids[uuid]['ws_uuid_1'] = res.uuid;
      console.log(">>> WebSocket 1 create status:", res);
    })
    .catch(err => console.error(">>> WebSocket 1 create error:", err))

    //-- Play audio file with ring back tone sound to PSTN 1 leg --

      console.log('>>> Play ring back tone as music-on-hold');

      vonage.voice.getCall(uuid)
        .then(res => {
          if (res.status == 'answered') { // is PSTN 1 leg still up?

            vonage.voice.streamAudio(uuid, 'http://client-sdk-cdn-files.s3.us-east-2.amazonaws.com/us.mp3', 0, -0.6)
              .then(res => console.log(`>>> streaming ring back tone to call ${uuid} status:`, res))
              .catch(err => {
                console.error(`>>> streaming ring back tone to call ${uuid} error:`, err)
              });

          }
         })
        .catch(err => console.error(">>> error get call status of PSTN 1 leg", uuid, err)) 

    //-- place outbound PSTN call (PSTN 2 leg) --

      vonage.voice.getCall(uuid)
        .then(res => {
          if (res.status == 'answered') { // is PSTN 1 leg still up?

            console.log('>>> calling PSTN 2');

            vonage.voice.createOutboundCall({
              to: [{
                type: 'phone',
                number: pstnCalleeNumber
              }],
              from: {
               type: 'phone',
               number: servicePhoneNumber
              },
              answer_url: ['https://' + hostName + '/answer_2?original_uuid=' + uuid],
              answer_method: 'GET',
              event_url: ['https://' + hostName + '/event_2?original_uuid=' + uuid],
              event_method: 'POST'
              })
              .then(res => {
                console.log(">>> outgoing PSTN 2 call status:", res);
                uuids[uuid]['uuid_2'] = res.uuid;
                })
              .catch(err => console.error(">>> outgoing call PSTN 2 error:", err))

          }
         })
        .catch(err => console.error(">>> error get call status of PSTN 1 leg", uuid, err)) 

  };

  //---

  if (req.body.status == 'completed') {

    //-- terminate WebSocket 1 leg if in progress
    const ws1Uuid = uuids[uuid]['ws_uuid_1'];

    if (ws1Uuid) {
      vonage.voice.getCall(ws1Uuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(ws1Uuid)
              .then(res => console.log(">>> WebSocket 1 leg terminated", ws1Uuid))
              .catch(err => null) // WebSocket 1 leg has already been terminated
          }
         })
        .catch(err => console.error(">>> error get call status of WebSocket 1 leg", ws1Uuid, err))    
    };

    //-- terminate PSTN 2 leg if in progress
    const pstn2Uuid = uuids[uuid]['uuid_2'];

    if (pstn2Uuid) {  // terminate PSTN 2 call while still ringing or just getting answered

      vonage.voice.getCall(pstn2Uuid)
      .then(res => {
          if (res.status == 'ringing' || res.status == 'answered' ) {
            vonage.voice.hangupCall(pstn2Uuid)
              .then(res => console.log(">>> PSTN 2 leg", pstn2Uuid, "cancelled"))
              .catch(err => null) // call has already been terminated 
          }
         })
      .catch(err => console.error(">>> error get call status of PSTN 2 leg", pstn2Uuid, err)) 

    }

    //--

    removeFromUuids(uuid) // set of associated parameters no longer needed

    console.log(">>> PSTN 1 leg", uuid, "has terminated");

  };

});

//--------------

app.get('/ws_answer_1', async(req, res) => {

  const hostName = req.hostname;
  const originalUuid = req.query.original_uuid; // first call leg (incoming call)

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + originalUuid,
      "canHear": [originalUuid],
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_1', async(req, res) => {

  res.status(200).send('Ok');

  const ws1Uuid = req.body.uuid;
  const originalUuid = req.query.original_uuid;


  if (req.body.status == 'ringing' || req.body.status == 'answered') {

    vonage.voice.getCall(originalUuid)
      
      .then(res => {

        if (res.status == 'completed') {

          vonage.voice.getCall(ws1Uuid)
          .then(res => {
              if (res.status != 'completed') {
                vonage.voice.hangupCall(ws1Uuid)
                  .then(res => console.log(">>> WebSocket 1 leg", ws1Uuid, "cancelled"))
                  .catch(err => null) // WebSocket 1 leg has already terminated 
              }
             })
          .catch(err => console.error(">>> error get call status of WebSocket 1 leg", ws1Uuid, err))  
  
        }
       
       })
      
      .catch(err => console.error(">>> error get status of PSTN 1 leg", originalUuid, err))  
  
  };

  //--

  if (req.body.status == 'completed') {

    console.log('>>> WebSocket 1 leg',  ws1Uuid, 'has terminated');

  };  

});

//--------------

app.get('/answer_2', async(req, res) => {

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.original_uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//--------------

app.post('/event_2', async(req, res) => {

  res.status(200).send('Ok');

  const originalUuid = req.query.original_uuid;
  const pstn2Uuid = req.body.uuid;
  const status = req.body.status;

  //--

  if (req.body.type == 'transfer') {

    const  hostName = req.hostname;

    //--

    vonage.voice.getCall(originalUuid)
      .then(res => {

        console.log('>>> PSTN 1 leg status:', res);

        if (res.status == 'answered') { // is PSTN 1 leg still up?

          // stop music-on-hold ring back tone (music-on-hold)      
          vonage.voice.stopStreamAudio(originalUuid)
            .then(res => console.log(`>>> stop streaming ring back tone to call ${originalUuid} status:`, res))
            .catch(err => {
              console.log(`>>> stop streaming ring back tone to call ${originalUuid} error:`, err.body);
            });

          //-- create WebSocket 2 --
          const wsUri = 'wss://' + processorServer + '/socket?user=agent&webhook_url=https://' + hostName + '/analytics';  

          console.log('>>> creating websocket 2', wsUri);

          vonage.voice.createOutboundCall({
            to: [{
              type: 'websocket',
              uri: wsUri,
              'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
              headers: {
              // pass here your own custom data, will be received as initial text message on the other end of this WebSocket
                entity_type: "agent",
                // entity_id: uuids[uuid]['user_id_2']
                interaction_id: "i_" + originalUuid // as an example
              }
            }],
            from: {
              type: 'phone',
              number: 19992550101 // value does not matter
            },
            answer_url: ['https://' + hostName + '/ws_answer_2?original_uuid=' + originalUuid + '&peer_uuid=' + pstn2Uuid + '&webhook_url=https://' + hostName + '/analytics'],
            answer_method: 'GET',
            event_url: ['https://' + hostName + '/ws_event_2?original_uuid=' + originalUuid + '&peer_uuid=' + pstn2Uuid + '&webhook_url=https://' + hostName + '/analytics'],
            event_method: 'POST'
            })
          .then(res => {
            uuids[originalUuid]['ws_uuid_2'] = res.uuid;
            console.log(">>> WebSocket 2 create status:", res);
          })
          .catch(err => console.error(">>> WebSocket 2 create error:", err));

        }
       })
      .catch(err => console.error(">>> Error get call status of PSTN 1 leg", originalUuid, err)) 
  
  };

  //--

  if (status == 'ringing' || status == 'answered') {
    
    vonage.voice.getCall(originalUuid)
      .then(res => {
        if (res.status == 'completed') { // has PSTN 1 leg terminated?

          vonage.voice.hangupCall(originalUuid)
            .then(res => console.log(">>> PSTN 2 leg", pstn2Uuid, "cancelled"))
            .catch(err => null) // PSTN 2 leg has already been terminated 
        
        }
       })
      .catch(err => console.error(">>> error get call status of PSTN 1 leg", originalUuid, err)) 

  };

  //--

  if (status == 'completed') {
    
    console.log('>>> PSTN 2 leg',  pstn2Uuid, 'has terminated');
  
  };

});

//--------------

app.get('/ws_answer_2', async(req, res) => {

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.original_uuid,
      "canHear": [req.query.peer_uuid],
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});    

//-------------- 

app.post('/ws_event_2', async(req, res) => {

  res.status(200).send('Ok');

  if (req.body.status == 'completed') {
    
    console.log('>>> WebSocket 2 leg',  req.body.uuid, 'has terminated');
  
  };

});

//--------------  

app.post('/analytics', async(req, res) => {

  console.log('>>> Analytics results:', req.body)

  res.status(200).send('Ok');

});  

//--- If this application is hosted on VCR (Vonage Cloud Runtime) serverless infrastructure (aka Neru) --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.VCR_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`Voice API application listening on port ${port}!`));

//------------
