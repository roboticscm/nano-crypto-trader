const ccxt = require('ccxt');
const { on } = require('nodemon');
require('dotenv').config();
const { getBalance, checkValidQueue, getMarketPrice, createBuyOrder, createSellOrderFromMarket, hasNewPrice, createSellOrderFromHistory } = require('./lib/trade');

let loopCount = 0;

const exchange = new ccxt.gateio({
    'apiKey': process.env.API_KEY,
    'secret': process.env.SECRET_KEY,
});

const printBalance = async (ex) => {
    const balance = await ex.fetchBalance()
    console.log("USDT Balance: ", balance.USDT.free);
}
const main = async () => {
    console.log('------------------------------------------');
    printBalance(exchange);
    if(!await checkValidQueue(exchange)) {
        console.log('Full of queue. Waiting...')
        return;
    }

    await createSellOrderFromHistory(exchange);

    const marketPrice = await getMarketPrice(exchange);

    if(await hasNewPrice(exchange, marketPrice)) {
        const marketBuyOrder = await createBuyOrder(exchange, marketPrice);
        if(marketBuyOrder) {
            await createSellOrderFromMarket(exchange, marketBuyOrder);
        }
    } else {
        console.log('Waiting for new price...');
    }
}

const loopMain = () => {
    setTimeout(async () => {
        await main();
        loopCount++;
        if(!process.env.LOOP_COUNT || loopCount < process.env.LOOP_COUNT) {
            loopMain();
        }
        
    }, process.env.REFRESH_TIME || 1000);
}

main();
loopMain();