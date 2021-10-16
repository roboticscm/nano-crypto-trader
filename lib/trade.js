
exports.getOpenOrdersCount = async (ex) => {
    if (ex.name === 'Gate.io') {
        const openOrders = await ex.fetchOpenOrders(process.env.COIN);
        return openOrders.length;
    } else {
        const orders = await ex.fetchOrders(process.env.COIN);
        return orders.filter((it) => it.status === 'open').length;
    }
}

exports.checkValidQueue = async (ex) => {
    const openOrders = await exports.getOpenOrdersCount(ex);
    console.log('Queue size: ',openOrders )
    if (openOrders >= process.env.QUEUE_SIZE) {
        return false;
    }

    return true;
}

exports.getMarketPrice = async (ex) => {
    const marketPrice = await ex.fetchTrades(process.env.COIN, undefined, 1);
    console.log(`Market price of ${process.env.COIN}: ${marketPrice[0].price}`);
    return marketPrice[0].price;
}

exports.createBuyOrder = async (ex, _marketPrice) => {
    const marketBuyAmount = +process.env.MARKET_BUY_AMOUNT
    const marketPrice = _marketPrice * 1.1;
    const limitBuyAmount = +process.env.LIMIT_BUY_AMOUNT
    const limitBuyPercent = +process.env.LIMIT_BUY_PERCENT
    if (marketBuyAmount > 0) {
        try {
            const marketOrdered = await ex.createMarketOrder(process.env.COIN, 'buy', marketBuyAmount, marketPrice);
            if (limitBuyAmount > 0 && limitBuyPercent) {
                const limitBuyPrice = marketOrdered.average * (1 + limitBuyPercent / 100)
                try {
                    const limitBuyOrder = await ex.createLimitBuyOrder(process.env.COIN, limitBuyAmount, limitBuyPrice);
                    console.log(`Created limit buy order: $: ${limitBuyOrder.symbol} - Qty: ${limitBuyOrder.amount} - Price: ${limitBuyOrder.price}`);
                } catch (err) {
                    console.error(err.message);
                }
            }
            console.log(`Created market buy order: $: ${marketOrdered.symbol} - Qty: ${marketOrdered.amount} - Average price: ${marketOrdered.average}`);
            return { amount: marketOrdered.amount, price: marketOrdered.average }
        } catch (err) {
            console.error(err.message);
        }
    } else if (limitBuyAmount > 0 && limitBuyPercent) {
        const limitBuyPrice = _marketPrice * (1 + limitBuyPercent / 100)
        try {
            const limitBuyOrder = await ex.createLimitBuyOrder(process.env.COIN, limitBuyAmount, limitBuyPrice);
            console.log(`Created limit buy order: $: ${limitBuyOrder.symbol} - Qty: ${limitBuyOrder.amount} - Price: ${limitBuyOrder.price}`);
        } catch (err) {
            console.error(err.message);
        }
    }
}

exports.createSellOrderFromMarket = async (ex, marketBuyOrder) => {
    const limitSellPrice = marketBuyOrder.price * (1 + +process.env.LIMIT_SELL_PERCENT / 100);
    try {
        const limitSellOrder = await ex.createLimitSellOrder(process.env.COIN, marketBuyOrder.amount, limitSellPrice);
        console.log(`Created limit sell order: $: ${limitSellOrder.symbol} - Qty: ${limitSellOrder.amount} - Price: ${limitSellOrder.price}`);
    } catch (err) {
        console.error(err.message);
    }
}

exports.hasNewPrice = async (ex, marketPrice) => {
    let openOrders = [];
    if (ex.name === 'Gate.io') {
        openOrders = await ex.fetchOpenOrders(process.env.COIN);
    } else {
        const orders = await ex.fetchOrders(process.env.COIN);
        openOrders = orders.filter((it) => it.status === 'open');
    }

    let shouldBuy = true;
    for(let order of openOrders) {
        if(!isVeryDiffPrice(order.side, order.price, marketPrice)) {
            shouldBuy = false;
            break;
        }
    }
    
    return shouldBuy;
}

const isVeryDiffPrice = (side, openPrice, marketPrice) => {
    let limitSellPrice;
    if(side === 'sell') {
       limitSellPrice = marketPrice * (1 + +process.env.LIMIT_SELL_PERCENT / 100);
    } else {
        limitSellPrice = marketPrice * (1 + +process.env.LIMIT_BUY_PERCENT / 100);
    }
    
    const diffPrice = marketPrice * (+process.env.DIFF_PERCENT / 100);
    if(Math.abs(openPrice - limitSellPrice) >= diffPrice) {
        return true;
    }

    return false;
}

exports.getBalance = async (ex) => {
    const balance = await ex.fetchBalance()
    return balance[process.env.COIN.split('/')[0]];
}

exports.createSellOrderFromHistory = async (ex) => {
    const freeBalance = (await exports.getBalance(ex)).free;

    const tradeHistory = await ex.fetchMyTrades(process.env.COIN, undefined, process.env.QUEUE_SIZE, {'order': 'asc'});
    
    tradeHistory.filter(it => {
        const d = (new Date()).valueOf();
        const dateDiff = (d - it.timestamp)/(60*1000);
        return dateDiff < 1 && it.takerOrMaker === 'maker' && it.side === 'buy'
    }).map(async it => {
        await exports.createSellOrderFromMarket(ex, {
            amount: it.amount,
            price: it.price
        })
    });
}