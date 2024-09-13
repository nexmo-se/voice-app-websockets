# Application using Vonage Voice API to connect Voice calls to an ASR engine via WebSockets

This sample application allows you to make or receive a voice call with a user, let user have some interaction with an IVR/Voice Bot if desired, then transfer the call to a second user.</br>
Audio from both users are streamed via WebSockets to a Connector for Automatic Speech Recognition (ASR), or other processing such as server-side noise cancellation, Voice AI, and more.

## About this sample application

This sample application makes use of Vonage Voice API to answer or place voice calls and set up WebSocket connections between Vonage API Voice platform and the Connector server.

Each WebSocket will forward audio from the users to the Connector.

The Connector may be extended to send audio back over the WebSocket, for example from an external Text-to-Speech (TTS) engine, a Voice Bot, or the audio stream back after noise cancellation processing.

The voice call legs may be a mix-and-match of regular phone (aka Public Switched Telephone Network - PSTN) type, Session Initiation Protocol (SIP) type, WebRTC type, Viber type, or even from another WebSocket type.

This sample application is with PSTN type legs for the users' voice calls, and can be easily extended to support the other leg types.

## Set up the Connector server - Host server public hostname and port

Deepgram is a service cloud provider for ASR.

The Connector server provides the connection to Deepgram cloud servers for ASR.

We use Deepgram ASR engine in this setup.

**Set up** the Deepgram Connector from this repository:

https://github.com/nexmo-se/deepgram-connector

The Connector server's local (not public!) `port` is: 6000.

For a `Local deployment`, you may use ngrok (an Internet tunneling service) for both this Voice API application and the Deepgram Connector application with [multiple ngrok tunnels](https://ngrok.com/docs#multiple-tunnels).

To do that, [download and install ngrok](https://ngrok.com/download).</br>
Sign in or sign up with [ngrok](https://ngrok.com/), from the ngrok web UI menu, follow the **Setup and Installation** guide.

Set up two domains, one to forward to the local port 8000 (as this server application will be listening on port 8000), the other one to the local port 6000 for the Deepgram Connector application.

Start ngrok to start both tunnels that forward to local ports 6000 and 8000,</br>
please take note of the ngrok **Enpoint URL** that forwards to local port 8000 as it will be needed in the next section,
that URL looks like:</br>
`https://yyyyyyyy.ngrok.io`

You will also need:
- The Connector server's public hostname and if necessary public port,</br>
e.g. `xxxxxxxx.ngrok.io`, `xxxxxxxx.herokuapp.com`, `myserver.mycompany.com:32000`  (as **`PROCESSOR_SERVER`**),</br>
no `port` is necessary with ngrok or heroku as public hostname,</br>
that host name to specify must not have leading protocol text such as https://, wss://, nor trailing /.

## Set up your Vonage Voice API application credentials and phone number

[Log in to your](https://ui.idp.vonage.com/ui/auth/login) or [sign up for a](https://ui.idp.vonage.com/ui/auth/registration) Vonage API account.

Go to [Your applications](https://dashboard.nexmo.com/applications), access an existing application or [+ Create a new application](https://dashboard.nexmo.com/applications/new).

Under Capabilities section (click on [Edit] if you do not see this section):

Enable Voice</br>

- Under Answer URL, leave HTTP GET, and enter</br>
`https://<host>:<port>/answer`</br>
(replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>

- Under Event URL, **select** HTTP POST, and enter</br>
`https://<host>:<port>/event`</br>
(replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>

Note: If you are using ngrok for this sample application, the Answer URL and Event URL look like:</br>
`https://yyyyyyyy.ngrok.io/answer`</br>
`https://yyyyyyyy.ngrok.io/event`</br> 

- Under Region, select a region, please take note of your selection,	

- Click on [Generate public and private key] if you did not yet create or want new ones, save the private key file in this application folder as .private.key (leading dot in the file name).</br>

**IMPORTANT**: Do not forget to click on [Save changes] at the bottom of the screen if you have created a new key set.</br>

- Link a phone number to this application if none has been linked to the application.

For the next steps, you will need:</br>
- The [account API key](https://dashboard.nexmo.com/settings) (as environment variable **`API_KEY`**)</br>
- The [account API secret](https://dashboard.nexmo.com/settings), not signature secret, (as environment variable **`API_SECRET`**)</br>
- The **`application ID`** (as environment variable **`APP_ID`**),</br>
- The selected **`Region`** (as environment variable **`API_REGION`**),</br>
- The **`linked phone number`** to your application (as environment variable **`SERVICE_PHONE_NUMBER`**).</br>

- The Connector server public hostname and port (as **`PROCESSOR_SERVER`**) without any prefix such as https:// or wss://, without any trailing slash, or sub-path</br>


## Running this Voice API application

You may select one of the following 2 types of deployments.

### Local deployment

To run your own instance of this sample application locally, you'll need Node.js (we tested with version 18.19).

Download this sample application code to a local folder, then go to that folder.

Copy the `.env.example` file over to a new file called `.env`:
```bash
cp .env.example .env
```

Edit `.env` file, and set the five parameter values:</br>
API_KEY=</br>
API_SECRET=</br>
APP_ID=</br>
SERVICE_PHONE_NUMBER=</br>
API_REGION=</br>
PROCESSOR_SERVER</br>
PSTN_CALLEE_NUMBER</br>


Install dependencies once:
```bash
npm install
```

Launch the applicatiom:
```bash
node voice-app-websockets
```

### Command Line Heroku deployment

You must first have deployed your application locally, as explained in previous section, and verified it is working.

Install [git](https://git-scm.com/downloads).

Install [Heroku command line](https://devcenter.heroku.com/categories/command-line) and login to your Heroku account.

If you do not yet have a local git repository, create one:</br>
```bash
git init
git add .
git commit -am "initial"
```

Start by creating this application on Heroku from the command line using the Heroku CLI:

```bash
heroku create myappname
```

Note: In above command, replace "myappname" with a unique name on the whole Heroku platform.

On your Heroku dashboard where your application page is shown, click on `Settings` button,
add the following `Config Vars` and set them with their respective values:</br>
API_KEY</br>
API_SECRET</br>
APP_ID</br>
SERVICE_PHONE_NUMBER</br>
API_REGION</br>
PROCESSOR_SERVER</br>
PSTN_CALLEE_NUMBER</br>
SIMULATED_DELAY</br>


Now, deploy the application:


```bash
git push heroku master
```

On your Heroku dashboard where your application page is shown, click on `Open App` button, that hostname is the one to be used under your corresponding [Vonage Voice API application Capabilities](https://dashboard.nexmo.com/applications) (click on your application, then [Edit]).</br>

For example, the respective links would be like:</br>
`https://yyyyyyyy.herokuapp.com/answer`</br>
`https://yyyyyyyy.herokuapp.com/event`</br>

See more details in above section **Set up your Vonage Voice API application credentials and phone number**.

## Using the Voice API application with the Connector


From any phone, dial the Vonage number (the one in the .env file),
or get called by entering in a web browser the address</br>
https://<server-address>/startcall?callee=<number-to-call></br>


## How this Voice API application works

### First call is an outbound call

- You may initiate an outgoing call to a user by entering in a web browser the address</br>
https://<server-address>/startcall?callee=<number-to-call></br>
- Once the call has been answered, GET `/answer_1` webhook gets called, it plays a Text-to-Speech (TTS) greeting to the callee ("action": "talk"), and drops that first leg, named PSTN 1 leg, into a named conference ("action": "conversation"),
- Once that PSTN 1 leg is effectively attached to the conference (webhook POST `/event_1` with "type": "transfer"), it creates WebSocket 1 leg,
- Once the WebSocket 1 connection has been accepted by the Connector server, GET `/ws_answer_1` webhook gets called, it drops that WebSocket 1 leg into the same named conference ("action": "conversation"); that WebSocket 1 listens only to PSTN 1 leg ("canHear" parameter),
- Instead of an actual IVR interaction (which you may implement), the interaction is simulated with a delay (_setTimeout_ of _simulatedDelay_ milliseconds) after which, an announcement is played to PSTN 1 user followed by the outgoing call to the second party (as PSTN 2 leg) and streaming an audio file as ring back tone to PSTN 1 user,
- Once the PSTN 2 call has been answered by the second user, GET `/answer_2` webhook gets called, it drops that PSTN 2 leg into the same named conference ("action": "conversation"); 
- Once that PSTN 2 leg is effectively attached to the conference (webhook POST `/event_2` with "type": "transfer"), it stops the ring back tone to PSTN 1 (stop streaming audio file), and it creates WebSocket 2 leg,
- Once the WebSocket 2 connection has been accepted by the Connector server, GET `/ws_answer_2` webhook gets called, it drops that WebSocket 2 leg into the same named conference ("action": "conversation"); that WebSocket 2 listens only to PSTN 2 leg ("canHear" parameter),
- Both PSTN 1 user and PSTN 2 user can talk to each other normally, while each WebSocket receives the audio from only a given user,
- Transcripts will be received by this application (from the Connector) in real time, via the POST `/analytics` webhook,
- When either user hangs up, all PSTN and WebSocket legs will be automatically terminated (parameter "endOnExit": "true"),
- There is some additional code to handle the case where PSTN 1 user hangs up while PSTN 2 is still ringing, it would automatically stops the ringing of PSTN 2 leg.

### First call is an inbound call

- On an incoming call to the **`linked phone number`**, GET `/answer` webhook (the Answer webhook as set in your dashboard for this application) gets called, it plays a Text-to-Speech (TTS) greeting to the caller ("action": "talk"), and drops that first leg, named PSTN A leg, into a named conference ("action": "conversation"),
- Once that PSTN A leg is effectively attached to the conference, POST `/event` webhook (the Event webhook as set in your dashboard for this application) gets called, with "type": "transfer", it creates WebSocket A leg,
- Once the WebSocket A connection has been accepted by the Connector server, GET `/ws_answer_a` webhook gets called, it drops that WebSocket A leg into the same named conference ("action": "conversation"); that WebSocket A listens only to PSTN A leg ("canHear" parameter),
- Instead of an actual IVR interaction (which you may implement), the interaction is simulated with a delay (_setTimeout_ of _simulatedDelay_ milliseconds) after which, an announcement is played to PSTN A user followed by the outgoing call to the second party (as PSTN B leg) and streaming an audio file as ring back tone to PSTN A user,
- Once the PSTN B call has been answered by the second user, GET `/answer_b` webhook gets called, it drops that PSTN B leg into the same named conference ("action": "conversation"); 
- Once that PSTN B leg is effectively attached to the conference (webhook POST `/event_b` with "type": "transfer"), it stops the ring back tone to PSTN A (stop streaming audio file), and it creates WebSocket B leg,
- Once the WebSocket B connection has been accepted by the Connector server, GET `/ws_answer_b` webhook gets called, it drops that WebSocket B leg into the same named conference ("action": "conversation"); that WebSocket B listens only to PSTN B leg ("canHear" parameter),
- Both PSTN A user and PSTN B user can talk to each other normally, while each WebSocket receives the audio from only a given user,
- Transcripts will be received by this application (from the Connector) in real time, via the POST `/analytics` webhook,
- When either user hangs up, all PSTN and WebSocket legs will be automatically terminated (parameter "endOnExit": "true"),
- There is some additional code to handle the case where PSTN A user hangs up while PSTN B is still ringing, it would automatically stops the ringing of PSTN B leg.
