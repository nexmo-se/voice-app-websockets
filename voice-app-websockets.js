'use strict'

//-------------

require('dotenv').config();

//--- for Neru installation ----
const neruHost = process.env.NERU_HOST;
console.log('neruHost:', neruHost);

//--
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

// Simulated delay before call transfer
const simulatedDelay = process.env.SIMULATED_DELAY;

// Test 2nd party phone number
const pstnCalleeNumber = process.env.PSTN_CALLEE_NUMBER;

//============= Initiating outbound PSTN calls ===============

//-- use case where the first PSTN call is outbound
//-- manually trigger outbound PSTN call to "callee" number - see sample request below
//-- establish first the WebSocket leg before the PSTN leg
//-- sample request: https://<server-address>/startcall?callee=12995550101
app.get('/startcall', async(req, res) => {

  if (req.query.callee == null) {
    // code may be added here to make sure the number is in valid E.164 format (without leading '+' sign)
    res.status(200).send('"callee" number missing as query parameter - please check');
  
  } else {
  
    res.status(200).send('Ok');  

    let hostName;

    if (neruHost) {
      hostName = neruHost;
    } else {
      hostName = req.hostname;
    }

    const calleeNumber = req.query.callee;

    vonage.voice.createOutboundCall({
      to: [{
        type: 'phone',
        number: calleeNumber
      }],
      from: {
       type: 'phone',
       number: servicePhoneNumber
      },
      answer_url: ['https://' + hostName + '/answer_1'],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/event_1'],
      event_method: 'POST'
      })
      .then(res => console.log(">>> outgoing PSTN call status:", res))
      .catch(err => console.error(">>> outgoing PSTN call error:", err))
  
  }

});

//-----------------------------

app.get('/answer_1', async(req, res) => {

  const nccoResponse = [
    {
      "action": "talk",
      "text": "This is a call from your preferred provider. Then, you possibly interact with some I V R or A I bot here",
      "language": "en-US", 
      "style": 11
    },
    {
      "action": "conversation",
      "name": "conf_" + req.query.uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

 res.status(200).json(nccoResponse);

});

//--------------------

app.post('/event_1', async(req, res) => {

  res.status(200).send('Ok');

  //--

  const uuid = req.body.uuid;

  //--

  if (req.body.type == 'transfer') {  // This is when the PSTN 1 leg is actually attached to the named conference

    let hostName;

    if (neruHost) {
      hostName = neruHost;
    } else {
      hostName = req.hostname;
    }

    //-- WebSocket connection --
    const wsUri = 'wss://' + processorServer + '/socket?user=User1&webhook_url=https://' + hostName + '/analytics';   
    console.log('>>> WebSocket URI:', wsUri);

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
        headers: {}
      }],
      from: {
        type: 'phone',
        number:  19999999999  // value does not matter
      },
      answer_url: ['https://' + hostName + '/ws_answer_1?original_uuid=' + uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_1?original_uuid=' + uuid],
      event_method: 'POST'
      })
      .then(res => {
        app.set('ws1_from_pstn1_' + uuid, res.uuid);
        console.log(">>> websocket create status:", res);
      })
      .catch(err => console.error(">>> websocket create status error:", err));

      //-- All following "setTimeout" are just to simulate some delay then trigger a call transfer to another line (second PSTN leg),
      //-- that's to mimic the actual usage where this application would trigger the transfer if needed after interaction from the 
      //-- PSTN 1 leg user with some voice bot / IVR or human interaction.
      //-- What's important here is to understand the sequence of call flows and used API requests

      setTimeout(() => {

        vonage.voice.getCall(uuid)
          .then(res => {
            if (res.status == 'answered') { // is PSTN 1 leg still up?

              vonage.voice.playTTS(uuid,  
                {
                text: "Please wait while we are transferring your call to the remote party",
                language: "en-US", 
                style: 11
                })
                .then(res => console.log("Play TTS on:", uuid, res))
                .catch(err => console.error("Failed to play TTS on:", uuid, err));
            
            }
           })
          .catch(err => console.error(">>> error get call status of PSTN 1 leg", uuid, err))  

      }, Number(simulatedDelay) );

      //-- Play audio file with ring back tone sound to PSTN 1 leg --

      setTimeout(() => {

        console.log('>>> moh');

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

        // 4000 ms: approximate duration of above TTS (there are ways to detect exact end of TTS, using RTC webhooks)      
      }, Number(simulatedDelay) + Number(4000) );  

      //-- Place outbound PSTN 2 call--
      setTimeout(() => {

        vonage.voice.getCall(uuid)
          .then(res => {
            if (res.status == 'answered') { // is PSTN 1 leg still up?

              console.log('>>> calling PSTN 2 callee');

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
                  app.set('pstn2_from_pstn1_' + uuid, res.uuid);
                  })
                .catch(err => console.error(">>> outgoing PSTN 2 call error:", err))

            }
           })
          .catch(err => console.error(">>> error get call status of PSTN 1 leg", pstn1Uuid, err)) 


          // 4000 ms: approximate duration of above TTS (there are ways to detect exact end of TTS, using RTC webhooks)      
      }, Number(simulatedDelay) + Number(4000)); 
  
  }  

  if (req.body.status == 'completed') {

    //-- terminate WebSocket 1 leg if in progress
    const ws1Uuid = app.get('ws1_from_pstn1_' + uuid);

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
    const pstn2Uuid = app.get('pstn2_from_pstn1_' + uuid);

    if (pstn2Uuid) {  // terminate PSTN 2 call while still ringing or just getting answered

      vonage.voice.getCall(pstn2Uuid)
      .then(res => {
          if (res.status == 'ringing' || res.status == 'answered' ) {
            vonage.voice.hangupCall(pstn2Uuid)
              .then(res => console.log(">>> PSTN 2 leg", pstn2Uuid, "cancelled"))
              .catch(err => null) // call has already terminated 
          }
         })
      .catch(err => console.error(">>> error get call status of PSTN 2 leg", pstn2Uuid, err)) 

    }

    //--

    app.set('ws1_from_pstn1_' + uuid, null); // parameter no longer needed
    app.set('pstn2_from_pstn1_' + uuid, null); // parameter no longer needed

    console.log('>>> PSTN 1 leg', uuid, 'has terminated');
  };

});

//--------------------

app.get('/ws_answer_1', async(req, res) => {

    const peerUuid = req.query.original_uuid;

    const nccoResponse = [
      {
        "action": "conversation",
        "name": "conf_" + peerUuid,  // same conference name as for PSTN 1 leg
        "canHear": [peerUuid],  // WebSocket 1 listens only to PSTN 1 leg
        "startOnEnter": true
      }
    ];

    res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_1', async(req, res) => {

  res.status(200).send('Ok');

  const pstn1Uuid = req.query.original_uuid;
  const uuid = req.body.uuid;

  //--

  if (req.body.status == 'ringing' || req.body.status == 'answered') {  

    vonage.voice.getCall(pstn1Uuid)
      
      .then(res => {

        if (res.status == 'completed') {

          vonage.voice.getCall(uuid)
          .then(res => {
              if (res.status != 'completed') {
                vonage.voice.hangupCall(uuid)
                  .then(res => console.log(">>> WebSocket 1 leg", uuid, "cancelled"))
                  .catch(err => null) // WebSocket 1 leg has already terminated 
              }
             })
          .catch(err => console.error(">>> error get call status of WebSocket A leg", wsAUuid, err))  
  
        }
       
       })
      
      .catch(err => console.error(">>> error get status of PSTN 1 leg ", pstn1Uuid, err))  
  
  };


  //--------

  if (req.body.status == 'completed') {
    console.log('>>> WebSocket 1 leg', req.body.uuid, 'has terminated');
  } 

});

//--------------------

app.get('/answer_2', async(req, res) => {

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.original_uuid,    // same conference name as for PSTN 1 leg
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//--------------------

app.post('/event_2', async(req, res) => {

  res.status(200).send('Ok');

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const pstn1Uuid = req.query.original_uuid;
  const pstn2Uuid = req.body.uuid;

  //--

  if (req.body.type == 'transfer') {

    // stop music-on-hold ring back tone (music-on-hold)      
    vonage.voice.stopStreamAudio(pstn1Uuid)
      .then(res => console.log(`>>> stop streaming ring back tone to call ${pstn1Uuid} status:`, res))
      .catch(err => {
        console.log(`>>> stop streaming ring back tone to call ${pstn1Uuid} error:`, err.body);
      });
    
    //-- WebSocket 2 --
    const wsUri = 'wss://' + processorServer + '/socket?user=User2&webhook_url=https://' + hostName + '/analytics';  
    console.log('>>> creating websocket 2', wsUri);

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
        headers: {}
      }],
      from: {
        type: 'phone',
        number: 19992550101 // value does not matter
      },
      answer_url: ['https://' + hostName + '/ws_answer_2?original_uuid=' + pstn1Uuid + '&peer_uuid=' + pstn2Uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_2?original_uuid=' + pstn1Uuid + '&peer_uuid=' + pstn2Uuid],
      event_method: 'POST'
      })
      .then(res => {
        console.log(">>> WebSocket 2 create status:", res);
        app.set('ws2_from_pstn2_' + pstn2Uuid, res.uuid);
        })      
      .catch(err => console.error(">>> WebSocket 2 create error:", err));

  };

  //--

  const status = req.body.status;

  //--

  if (status == 'ringing' || status == 'answered') {
    
    vonage.voice.getCall(pstn1Uuid)
      .then(res => {
        if (res.status == 'completed') { // has PSTN 1 leg terminated?

          vonage.voice.hangupCall(pstn2Uuid)
            .then(res => console.log(">>> PSTN 2 leg", pstn2Uuid, "cancelled"))
            .catch(err => null) // PSTN 2 leg has already terminated 
        
        }
       })
      .catch(err => console.error(">>> error get call status of PSTN 2 leg", pstn2Uuid, err)) 

  };

  //--

  if (status == 'completed') {

    //-- terminate WebSocket 2 leg if in progress
    const ws2Uuid = app.get('ws2_from_pstn2_' + pstn2Uuid);

    if (ws2Uuid) {
      vonage.voice.getCall(ws2Uuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(ws2Uuid)
              .then(res => console.log(">>> WebSocket 2 leg terminated", ws2Uuid))
              .catch(err => null) // WebSocket 2 leg has already terminated
          }
         })
        .catch(err => console.error(">>> error get call status of WebSocket 2 leg", ws2Uuid, err))    
    };

    //--

    app.set('ws2_from_pstn2_' + pstn2Uuid, null); // parameter no longer needed
    
    console.log('>>> PSTN 2 leg', pstn2Uuid, 'has terminated');
  };

});

//--------------------

app.get('/ws_answer_2', async(req, res) => {

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.original_uuid,  // same conference name as for PSTN 1 leg
      "canHear": [req.query.peer_uuid],   // WebSocket 2 listens only to PSTN 2 leg
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//--------------------

app.post('/ws_event_2', async (req, res) => {

  res.status(200).send('Ok');

  if (req.body.status == 'completed') {
    console.log('>>> WebSocket 2 leg', req.body.uuid, 'has terminated');
  } 

});

//============= Processing inbound PSTN calls ===============

app.get('/answer', async(req, res) => {

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const nccoResponse = [
    {
      "action": "talk",
      "text": "Thank you for calling your preferred provider. Then, you possibly interact with some I V R or A I bot here",
      "language": "en-US", 
      "style": 11
    },
    {
      "action": "conversation",
      "name": "conf_" + req.query.uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const uuid = req.body.uuid;

  if (req.body.type == 'transfer') {

    if ( app.get('leg_type_' + uuid) != 'websocket' ) {

      //-- create WebSocket A --
      const wsUri = 'wss://' + processorServer + '/socket?user=User1&webhook_url=https://' + hostName + '/analytics';
      console.log('>>> WebSocket URI:', wsUri);

      vonage.voice.createOutboundCall({
        to: [{
          type: 'websocket',
          uri: wsUri,
          'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
          headers: {}
        }],
        from: {
          type: 'phone',
          number:  19992550101 // value does not matter
        },
        answer_url: ['https://' + hostName + '/ws_answer_a?original_uuid=' + uuid],
        answer_method: 'GET',
        event_url: ['https://' + hostName + '/ws_event_a?original_uuid=' + uuid],
        event_method: 'POST'
        })
        .then(res => {
          app.set('wsa_from_pstna_' + uuid, res.uuid);
          console.log(">>> WebSocket create status:", res);
        })
        .catch(err => console.error(">>> WebSocket create error:", err))

      //-- All following "setTimeout" are just to trigger and simulate a call transfer to another line (second PSTN leg)
      //-- In actual usage, your application would trigger the transfer if needed after interaction from the first
      //-- PSTN A leg user with some voice bot or human interaction
      //-- What's important here is to understand the sequence of call flows and used API requests

      setTimeout(() => {

        vonage.voice.getCall(uuid)
          .then(res => {
            if (res.status == 'answered') { // is PSTN A leg still up?

              console.log("play TTS", uuid);

              vonage.voice.playTTS(uuid,  
                {
                text: 'Please wait while we are transferring your call to the remote party',
                language: 'en-US', 
                style: 11
                })
                .then(res => console.log("Play TTS on:", uuid, res))
                .catch(err => console.error("Failed to play TTS on:", uuid, err));
            
            }
           })
          .catch(err => console.error(">>> error get call status of PSTN A leg", pstnAUuid, err))  

      }, Number(simulatedDelay) );

      //-- play audio file with ring back tone sound to PSTN A leg --
      setTimeout(() => {

        vonage.voice.getCall(uuid)
          .then(res => {
            if (res.status == 'answered') { // is PSTN A leg still up?

              vonage.voice.streamAudio(uuid, 'http://client-sdk-cdn-files.s3.us-east-2.amazonaws.com/us.mp3', 0, -0.6)
                .then(res => console.log(`>>> streaming ring back tone to call ${uuid} status:`, res))
                .catch(err => {
                  console.error(`>>> streaming ring back tone to call ${uuid} error:`, err)
                });

            }
           })
          .catch(err => console.error(">>> error get call status of PSTN A leg", uuid, err))  

        // 4000 ms: approximate duration of above TTS (there are ways to detect exact end of TTS, using RTC webhooks)      
      }, Number(simulatedDelay) + Number(4000) );   

      //-- place outbound PSTN call leg B --

      setTimeout(() => {

        vonage.voice.getCall(uuid)
          .then(res => {
            if (res.status == 'answered') { // is PSTN A leg still up?

              console.log('>>> calling PSTN B');

              vonage.voice.createOutboundCall({
                to: [{
                  type: 'phone',
                  number: pstnCalleeNumber
                }],
                from: {
                 type: 'phone',
                 number: servicePhoneNumber
                },
                answer_url: ['https://' + hostName + '/answer_b?original_uuid=' + uuid],
                answer_method: 'GET',
                event_url: ['https://' + hostName + '/event_b?original_uuid=' + uuid],
                event_method: 'POST'
                })
                .then(res => {
                  console.log(">>> outgoing PSTN B call status:", res);
                  app.set('pstnb_from_pstna_' + uuid, res.uuid);
                  })
                .catch(err => console.error(">>> outgoing call PSTN B error:", err))

            }
           })
          .catch(err => console.error(">>> error get call status of PSTN A leg", uuid, err)) 

          // 5000 ms: approximate duration of above TTS (there are ways to detect exact end of TTS, using RTC webhooks)      
      }, Number(simulatedDelay) + Number(5000)); 

    }     

  }; // close if req.body.type

  //--

  if (req.body.status == 'completed') {

    //-- terminate WebSocket A leg if in progress
    const wsAUuid = app.get('wsa_from_pstna_' + uuid);

    if (wsAUuid) {
      vonage.voice.getCall(wsAUuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(wsAUuid)
              .then(res => console.log(">>> WebSocket A leg terminated", wsAUuid))
              .catch(err => null) // WebSocket A leg has already been terminated
          }
         })
        .catch(err => console.error(">>> error get call status of PSTN A leg", wsAUuid, err))    
    };

    //-- terminate PSTN B leg if in progress
    const pstnBUuid = app.get('pstnb_from_pstna_' + uuid);

    if (pstnBUuid) {  // terminate PSTN B call while still ringing or just getting answered

      vonage.voice.getCall(pstnBUuid)
      .then(res => {
          if (res.status == 'ringing' || res.status == 'answered' ) {
            vonage.voice.hangupCall(pstnBUuid)
              .then(res => console.log(">>> PSTN B leg", pstnBUuid, "cancelled"))
              .catch(err => null) // call has already been terminated 
          }
         })
      .catch(err => console.error(">>> error get call status of PSTN B leg", pstnBUuid, err)) 

    }

    //--

    app.set('wsa_from_pstna_' + uuid, null); // parameter no longer needed
    app.set('pstnb_from_pstna_' + uuid, null); // parameter no longer needed 

    console.log(">>> PSTN A leg", uuid, "has terminated");

  };

});

//--------------

app.get('/ws_answer_a', async(req, res) => {

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const pstnAUuid = req.query.original_uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + pstnAUuid,
      "canHear": [pstnAUuid],
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_a', async(req, res) => {

  res.status(200).send('Ok');

  const wsAUuid = req.body.uuid;
  const pstnAUuid = req.query.original_uuid;
  
  if (req.body.type == 'transfer') {

    let hostName;

    if (neruHost) {
      hostName = neruHost;
    } else {
      hostName = req.hostname;
    }   

  };

  //--

  if (req.body.status == 'ringing' || req.body.status == 'answered') {

    vonage.voice.getCall(pstnAUuid)
      
      .then(res => {

        if (res.status == 'completed') {

          vonage.voice.getCall(wsAUuid)
          .then(res => {
              if (res.status != 'completed') {
                vonage.voice.hangupCall(wsAUuid)
                  .then(res => console.log(">>> WebSocket A leg", wsAUuid, "cancelled"))
                  .catch(err => null) // WebSocket A leg has already terminated 
              }
             })
          .catch(err => console.error(">>> error get call status of WebSocket A leg", wsAUuid, err))  
  
        }
       
       })
      
      .catch(err => console.error(">>> error get status of PSTN A leg", pstnAUuid, err))  
  
  };

  //--

  if (req.body.status == 'completed') {

    console.log('>>> WebSocket A leg',  wsAUuid, 'has terminated');

  };  

});

//--------------

app.get('/answer_b', async(req, res) => {

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

app.post('/event_b', async(req, res) => {

  res.status(200).send('Ok');

  const pstnAUuid = req.query.original_uuid;
  const pstnBUuid = req.body.uuid;
  const status = req.body.status;
  const calleeNumber = req.query.callee_number;

  //--

  if (req.body.type == 'transfer') {

    let hostName;

    if (neruHost) {
      hostName = neruHost;
    } else {
      hostName = req.hostname;
    }

    //--

    vonage.voice.getCall(pstnAUuid)
      .then(res => {

        console.log('>>> pstnAUuid res:', res);

        if (res.status == 'answered') { // is PSTN A leg still up?

          // stop music-on-hold ring back tone (music-on-hold)      
          vonage.voice.stopStreamAudio(pstnAUuid)
            .then(res => console.log(`>>> stop streaming ring back tone to call ${pstnAUuid} status:`, res))
            .catch(err => {
              console.log(`>>> stop streaming ring back tone to call ${pstnAUuid} error:`, err.body);
            });

          //-- create WebSocket 2 --
          const wsUri = 'wss://' + processorServer + '/socket?user=User2&webhook_url=https://' + hostName + '/analytics';  

          console.log('>>> creating websocket 2', wsUri);

          vonage.voice.createOutboundCall({
            to: [{
              type: 'websocket',
              uri: wsUri,
              'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
              headers: {}
            }],
            from: {
              type: 'phone',
              number: 19992550101 // value does not matter
            },
            answer_url: ['https://' + hostName + '/ws_answer_b?original_uuid=' + pstnAUuid + '&peer_uuid=' + pstnBUuid],
            answer_method: 'GET',
            event_url: ['https://' + hostName + '/ws_event_b?original_uuid=' + pstnAUuid + '&peer_uuid=' + pstnBUuid],
            event_method: 'POST'
            })
            .then(res => console.log(">>> websocket create status:", res))
            .catch(err => console.error(">>> websocket create status:", err));

        }
       })
      .catch(err => console.error(">>> error get call status of PSTN A leg", pstnAUuid, err)) 
  
  };

  //--

  if (status == 'ringing' || status == 'answered') {
    
    vonage.voice.getCall(pstnAUuid)
      .then(res => {
        if (res.status == 'completed') { // has PSTN A leg terminated?

          vonage.voice.hangupCall(pstnBUuid)
            .then(res => console.log(">>> PSTN B leg", pstnBUuid, "cancelled"))
            .catch(err => null) // PSTN B leg has already been terminated 
        
        }
       })
      .catch(err => console.error(">>> error get call status of PSTN A leg", pstnAUuid, err)) 

  };

  //--

  if (status == 'completed') {
    
    console.log('>>> PSTN B leg',  pstnBUuid, 'has terminated');
  
  };

});

//--------------

app.get('/ws_answer_b', async(req, res) => {

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

app.post('/ws_event_b', async(req, res) => {

  res.status(200).send('Ok');

  if (req.body.status == 'completed') {
    
    console.log('>>> WebSocket B leg',  req.body.uuid, 'has terminated');
  
  };

});

//--------------  

app.post('/analytics', async(req, res) => {

  console.log('>>> Analytics results:', req.body)

  res.status(200).send('Ok');

});  

//--------------  

app.post('/rtc', async(req, res) => {

  console.log('>>> RTC type:', req.body.type)

  res.status(200).send('Ok');

});  

//--- If this application is hosted on VCR (Vonage Cloud Runtime) serverless infrastructure (aka Neru) --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.NERU_APP_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`Voice API application listening on port ${port}!`));

//------------
