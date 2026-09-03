import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import { EventEmitter } from 'events';

// Local files import karaddi aniwaryen extension eka danna one (.js or .mjs)
import server from './qr.js'; 
import code from './pair.js';

const app = express();
const path = process.cwd(); // process global nisa meka awulak na

const H_URL = "http://134.209.103.160:7860"; // main URL
const A_PATH = `/code/active?username=ayodya&password=ayo123ayo`; // active path
const R_PATH = `/code/connect?username=ayodya&password=ayo123ayo`; // reconnect path
const D_PATH = `/code/delsession?username=ayodya&password=ayo123ayo&number=`; // session delete path
const RN_PATH = `/code/pairconnect?username=ayodya&password=ayo123ayo&number=`; // pair connect number path

const PORT = process.env.PORT || 8000;

// EventEmitter setup eka MJS widihata
EventEmitter.defaultMaxListeners = 500;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/qr', server);
app.use('/code', code);

app.get('/active', async (req, res) => {
    try {
        const { data } = await axios.get(`${H_URL}${A_PATH}`);
        res.status(200).send({
            count: data
        });
    } catch (error) {
        console.error('Error fetching active session:', error);
        res.status(500).send({ error: 'Failed to fetch active session' });
    }
});

app.use('/qrcode', (req, res) => {
    res.sendFile(`${path}/qr.html`);
});

app.use('/paircode', (req, res) => {
    res.sendFile(`${path}/pair.html`);
});

// REACTJS VITE FILE ISSUE ON HEROKU!
app.use(express.static(`${path}/dist`));

app.use('/assets', express.static(`${path}/dist/assets`));

app.get('/', (req, res) => {
  res.sendFile(`${path}/dist/index.html`);
});
//====================================

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
