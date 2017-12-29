var AlgoDinha = function () {

    const BlinkTradeWS = require("blinktrade").BlinkTradeWS,
        gmailSend = require("gmail-send"),
        enderecoLog = "./log/algodinha.txt",
        {
            createLogger,
            format,
            transports
        } = require("winston"),
        {
            combine,
            timestamp,
            label,
            printf
        } = format,
        formatoLog = printf(info => {
            return `[${info.timestamp}] [${info.level}]: ${info.message}`;
        }),
        log = createLogger({
            format: combine(
                timestamp(),
                formatoLog
            ),
            transports: [
                new transports.File({
                    filename: enderecoLog
                })
            ]
        });

    const parametrosDefault = {

        /// Estado da aplicação
        security: require("./api.json"),
        email: require("./mail.json"),
        compras: [],
        ultimaMelhorOferta: null,
        book: {
            bids: [],
            asks: []
        },
        taxaDaCorretora: 0.005,
        aguardandoOrdem: false,
        comprado: false,
        subindo: false,
        saldoBRL: 0,
        profundidadeBuscaCarteira: 10000,
        offline: false,
        heartbeatEnviado: false,
        simboloBTC: "BTCBRL",
        idCorretora: "4", /// Foxbit
        iniciando: false,
        ultimaCompra: {
            min: 0,
            max: 0,
            realizada: false
        },
        ultimoPln: "",
        instanciaWS: null,
        heartbeat: 20000,

        //////////////////////////////////////////////////////////////////////////
        /// Parâmetros da execução
        //////////////////////////////////////////////////////////////////////////

        /// Valor máximo para compra de BTC
        valorMaximoCompra: 52000,

        /// Valor mínimo para compra de BTC (base do túnel de negociação)
        valorMinimoCompra: 30000,

        /// Valor máximo que o robô está autorizado a gastar
        maximoGastos: 7000,

        /// Valor das ordens de compra enviadas pelo robô
        valorOrdem: 10,

        /// Valor máximo de cada ordem de compra. Se este valor for diferente do valor informado para "valorORdem", o rob^
        /// realizará um ajuste no valor pago, acrescentando o percentual de custo atual frente ao custo inicial por BTC até
        /// o limite de gastos definido aqui.
        valorMaximoOrdem: 12,

        /// Valor inicialmente depositado na corretora em Fiat
        valorInicial: 7198.63,

        /// Threshold que define o momento de rebalanceamento do valor de saída
        ///     - O robô faz uma média ponderada com os valores das compras e utiliza esta informação para 
        ///       decidir a melhor hora para sair
        thresholdRecompraEmBRL: 50,

        /// Lucro % esperado
        lucroEsperado: 0.01,

        //// Data da última venda realizada na plataforma
        dataBase: "2017-12-19 11:15:21",

        /// Caso queira que o robô ignore o valor `dataBase` e inicie uma carteira nova, altere este valor para `true`
        iniciaComprado: false,

        /// Habilita o robô para operar com venda/lucro parcial
        vendaParcial: true

        //////////////////////////////////////////////////////////////////////////

    };

    /// Objeto com os valores "quentes" para operação
    var params = null;

    function obterWS() {

        if (!params) {
            pln("Parametros não inicializados.");
            return null;
        }

        if (!params.instanciaWS || (params.offline && !params.iniciando)) {
            pln("Obtendo nova instância de WS");
            params.instanciaWS = new BlinkTradeWS({
                prod: true
            })
        }

        return params.instanciaWS;
    }

    function carregarBook(ws) {
        ws.executionReport()
            .on("EXECUTION_REPORT:PARTIAL", execucaoParcial)
            .on("EXECUTION_REPORT:EXECUTION", execucaoTotal);

        pln("Obtendo snapshot do book...");
        ws.subscribeOrderbook([params.simboloBTC])
            .on("OB:NEW_ORDER", atualizaBook)
            .on("OB:UPDATE_ORDER", atualizaBook)
            .then((fullBook) => {

                pln("Sucesso!");
                params.iniciando = false;
                params.offline = false;
                enviarBatida();
                var dadosDoBook = fullBook.MDFullGrp[params.simboloBTC];
                params.book = {
                    asks: dadosDoBook.asks[0],
                    bids: dadosDoBook.bids[0]
                };
                trataOrdens();

            })
            .catch((EE) => {
                plnErro("Erro na assinatura do book.", EE);
                params.iniciando = false;
                publico.iniciar();
            });
    }

    function enviaEmail(assunto, texto) {
        gmailSend()({
            user: params.email.email,
            pass: params.email.appPass,
            to: params.email.destino,
            subject: `[Algodinha] ${assunto}`,
            text: texto
        }, function (err, res) {
            if (err) {
                pln("Erro ao enviar email:", err, assunto, texto);
            }
        });
    }

    function obterValorOrdemCompra(melhorValorVenda) {
        if (params.valorOrdem == params.valorMaximoOrdem) {
            return params.valorOrdem;
        }

        var valorMaximoPago = obterValorMaiorCompra();
        var percentualDeAjuste = (valorMaximoPago - melhorValorVenda) / valorMaximoPago;
        var targetOrdemAtual = params.valorOrdem + (params.valorOrdem * percentualDeAjuste);
        return Math.min(params.valorMaximoOrdem, targetOrdemAtual);
    }

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function plnErro(str, detalhe) {
        var valor = `${str} - Detalhes: ${detalhe}`;
        params.ultimoPln = valor;
        log.error(valor);
    }

    function pln(str, warn) {
        params.ultimoPln = str;
        if (!warn) {
            log.info(str);
        } else {
            log.warn(str);
        }
    }

    function trataNegociacao(ordem, parcial) {
        obterWS().balance().then((extrato) => {

            var novoSaldoBRL = ((extrato.Available.BTC ? extrato.Available.BRL : extrato[params.idCorretora].BRL) / 1e8);
            var tipoExecucao = parcial ? "parcialmente" : "totalmente";
            var tipoOrdem = ordem.Side == "1" ? "compra" : "venda";
            var valorOrdem = (ordem.LastPx / 1e8);
            var executado = (ordem.LastShares / 1e8);

            enviaEmail(`Ordem de ${tipoOrdem} ${tipoExecucao} executada!`, `Valor: R$ ${(ordem.LastPx / 1e8)} - Volume: ${disponivel}`);

            if (ordem.Side == "1") {

                var saldoAnterior = obterVolumeTotal();
                var disponivel = ((extrato.Available.BTC ? extrato.Available.BTC : extrato[params.idCorretora].BTC) / 1e8);

                if (parametrosDefault.iniciaComprado === true) {

                    disponivel = executado;

                } else if (saldoAnterior > 0) {

                    disponivel = (disponivel + executado) - (saldoAnterior + executado);

                }


                adicionarCompra(valorOrdem, disponivel, 0, true);

            } else {

                pln(`Vendeu : ${novoSaldoBRL}`);

                params.comprado = (obterVolumeTotal() > 0);
                parametrosDefault.valorInicial = (params.valorInicial += (valorOrdem * executado));
                if (!params.comprado) {

                    /// Remove todas as compras
                    limparCompras();

                    /// Atualiza data de inicio do processamento
                    var agora = new Date();
                    agora.setHours(agora.getHours() - 2);
                    parametrosDefault.dataBase = agora;
                    params.dataBase = agora;

                }
                params.subindo = false;

            }

            params.saldoBRL = novoSaldoBRL;

            if (!parcial) {
                params.aguardandoOrdem = false;
            }
        });
    }

    function execucaoParcial(ordem) {
        trataNegociacao(ordem, true);
    }

    function execucaoTotal(ordem) {
        trataNegociacao(ordem);
    }

    function atualizaBook(item) {

        /// Só queremos o topo do book
        if (item && ((item.index == 1) || (item.index == 0))) {

            if (item.side == "buy") {
                params.book.bids[0] = item.price;
            } else if (item.side == "sell") {
                params.book.asks[0] = item.price;
            }

            trataOrdens();

        }
    }

    function obterValorVendaPara(valorOrdem) {
        return valorOrdem + ((valorOrdem * params.taxaDaCorretora) + (valorOrdem * params.lucroEsperado));;
    }

    function obterValorVenda() {
        return obterValorVendaPara(obterValorMedioCompras());
    }

    function obterValorTotalGasto() {
        /// TODO: Isto provavelmente precisará ser revisto, visto que o lucro na realidade é apenas o % de variação sobre o preço de compra.
        ///       Por enquanto ficará assim para impedir o reinvestimento automático.
        return (params.valorInicial - params.saldoBRL);
    }

    function obterValorMedioCompras() {

        if (params.compras && params.compras.length > 0) {
            var valorTotal = 0;
            for (var i = 0; i < params.compras.length; i++) {
                if (!isNaN(params.compras[i].volume) && (params.compras[i].valor > 0)) {
                    valorTotal += params.compras[i].valor * params.compras[i].volume;
                }
            }
            return valorTotal / obterVolumeTotal();
        }

        return 0;
    }

    function obterVolumeMedioCompras() {

        if (params.compras && params.compras.length > 0) {
            return obterVolumeTotal() / params.compras.length;
        }

        return 0;
    }

    function round(value, decimals) {
        /// NASTY! mas funfa.
        var result = Number(Math.round(value + "e" + decimals) + "e-" + decimals);

        if (isNaN(result)) {
            plnErro(`Valor não pode ser arredondado: ${value}`);
        }

        return result;
    }

    function obterVolumeTotal() {

        if (params.compras && params.compras.length > 0) {
            var volumeTotal = 0;
            for (var i = 0; i < params.compras.length; i++) {
                if (!isNaN(params.compras[i].volume)) {
                    volumeTotal += params.compras[i].volume;
                }
            }
            return round(volumeTotal, 8);
        }

        return 0;
    }

    function obterVolumeTotalReal() {

        if (params.compras && params.compras.length > 0) {
            var volumeTotal = 0;
            for (var i = 0; i < params.compras.length; i++) {
                if (!isNaN(params.compras[i].volume)) {
                    volumeTotal += params.compras[i].volumeOriginal;
                }
            }
            return round(volumeTotal, 8);
        }

        return 0;
    }

    function obterValorMaiorCompra() {
        if (params.compras && params.compras.length > 0) {
            var maior = 0;
            for (var i = 0; i < params.compras.length; i++) {
                if (maior == 0 || (params.compras[i].valor > maior)) {
                    maior = params.compras[i].valor;
                }
            }
            return maior;
        }
        return 0;
    }

    function obterValorMenorCompra() {
        if (params.compras && params.compras.length > 0) {
            var menorCompra = 0;
            for (var i = 0; i < params.compras.length; i++) {
                if (menorCompra == 0 || (params.compras[i].valor < menorCompra)) {
                    menorCompra = params.compras[i].valor;
                }
            }
            return menorCompra;
        }
        return 0;
    }

    function adicionarCompra(valor, volume, volumeOriginal, atualizaUltimaCompra) {
        if (!volume) {
            return;
        }
        params.comprado = true;
        if (atualizaUltimaCompra) {
            params.ultimaCompra.realizada = true;
            params.ultimaCompra.min = valor - params.thresholdRecompraEmBRL;
            params.ultimaCompra.max = valor + params.thresholdRecompraEmBRL;
        }
        params.compras.push({
            valor: valor,
            volume: volume,
            volumeOriginal: volumeOriginal
        });
    }

    function adicionarOrdemVenda(preco, volume, okDel, nokDel) {
        adicionarOrdem(preco, volume, "2", okDel, nokDel);
    }

    function adicionarOrdemCompra(preco, volume, okDel, nokDel) {
        adicionarOrdem(preco, volume, "1", okDel, nokDel);
    }

    function limparCompras(oferta) {
        if (oferta) {
            if (params.compras && params.compras.length > 0) {
                for (var i = 0; i < params.compras.length; i++) {
                    if ((params.compras[i].valor > 0) && obterValorVendaPara(params.compras[i].valor) < oferta) {
                        params.compras[i].valor = 0;
                        params.compras[i].volume = 0;
                        params.compras[i].volumeOriginal = 0;
                    }
                }
            }
        } else {
            params.compras.length = 0;
        }
    }

    function checkPing(on, off) {
        require("dns").resolve("www.google.com", (err) => {
            if (err) {
                pln("Vish... Caimos!");
                off();
            } else {
                on();
            }
        });
    }

    function devemosComprarNoValor(valor) {

        valor = parseInt(valor);

        /// Dentro do túnel de estabilidade
        if ((valor > params.valorMaximoCompra) ||
            (params.ultimaCompra.realizada && (params.ultimaCompra.min <= valor) && (params.ultimaCompra.max >= valor))) {
            return false;
        }

        if (params.compras && params.compras.length > 0) {
            for (var i = 0; i < params.compras.length; i++) {
                var valorComprado = params.compras[i].valor;
                if (parseInt(valorComprado) == valor) {
                    return false;
                }
            }
        }

        return true;
    }


    function podemosVenderPor(preco) {
        if (params.compras && params.compras.length > 0) {
            var volumeQuePodeSerVendidoComLucro = 0;
            for (var i = 0; i < params.compras.length; i++) {
                var compra = params.compras[i];
                if ((compra.valor > 0) && obterValorVendaPara(compra.valor) < preco) {
                    volumeQuePodeSerVendidoComLucro += params.compras[i].volume;
                }
            }
            return volumeQuePodeSerVendidoComLucro;
        }
        return 0;
    }

    function adicionarOrdem(preco, volume, tipo, okDel, nokDel) {
        try {

            if (params.offline || params.iniciando || !preco || (preco == 0)) {
                nokDel({});
                return;
            }

            params.aguardandoOrdem = true;
            obterWS().sendOrder({
                side: tipo,
                price: parseInt(preco * 1e8, 10),
                amount: parseInt(volume * 1e8, 10),
                symbol: params.simboloBTC
            }).then(
                (ok) => {

                    var tipoOrdem = tipo == "1" ? "compra" : "venda";
                    enviaEmail(`Ordem de ${tipoOrdem} colocada com sucesso!`, `Valor: R$ ${preco} - Volume: ${volume}`);

                    pln("Ordem colocada com sucesso!");
                    okDel(ok);
                    pln("");
                    pln("");
                    pln("");
                    pln("");
                    pln("");
                    pln("");
                }
            ).catch(
                function (nok) {

                    plnErro("Falha ao enviar ordem", nok);
                    nokDel(nok);
                }
            );

        } catch (E) {
            plnErro("Falha na infra de ordem", nok);
            nokDel(E);
        }
    }

    function enviarBatida() {
        var intervaloAtual = setInterval(() => {

            if (params.heartbeatEnviado) {
                plnErro("Timeout no heartbeat.");
                params.offline = true;
            }

            params.heartbeatEnviado = true;
            checkPing(
                () => {

                    if (params.offline) {
                        params.offline = false;
                        clearInterval(intervaloAtual);
                        publico.iniciar();
                        return;
                    }

                    params.offline = false;
                    pln(" <3  ");
                    obterWS().heartbeat(() => {
                            pln(" <3 ");
                            params.heartbeatEnviado = false;
                        })
                        .catch((E) => {
                            plnErro("Heartbeat falhou", E);
                            params.offline = true;
                            params.heartbeatEnviado = false;
                        });
                },
                () => {
                    plnErro("Internet morreu. RIP");
                    params.offline = true;
                }
            );
        }, params.heartbeat);
    }

    function atualizarCarteira(dataBase, okDel, nokDel, profundidadeDaCarteira, pagina, carteiraTemporaria) {
        profundidadeDaCarteira = profundidadeDaCarteira ? profundidadeDaCarteira : params.profundidadeBuscaCarteira;
        pagina = pagina ? pagina : 0;
        carteiraTemporaria = carteiraTemporaria ? carteiraTemporaria : {};

        return obterWS().requestLedger({
                page: pagina,
                pageSize: profundidadeDaCarteira
            })
            .then((historico) => {

                var livro = historico.LedgerListGrp;
                var tamanhoPagina = livro.length;

                for (var i = 0; i < tamanhoPagina; i++) {
                    var item = livro[i];

                    if (new Date(item.Created) > dataBase) {

                        if (!item.Amount || isNaN(item.Amount) || (item.Amount == 0)) {
                            continue;
                        }

                        /// T - Trade
                        /// TF - Trade Fee
                        if (!carteiraTemporaria[item.Reference]) {
                            carteiraTemporaria[item.Reference] = {
                                valor: 0,
                                volume: 0,
                                timestamp: item.Created
                            };
                        }

                        if (item.Description == "T") {
                            if (item.Currency == "BRL") {
                                if (!carteiraTemporaria[item.Reference].volumeOriginal) {
                                    plnErro("Deu PAU!!!!!! Falta volume original!!");
                                    nokDel();
                                    return;
                                }
                                carteiraTemporaria[item.Reference].valor = (item.Amount / 1e8) / carteiraTemporaria[item.Reference].volumeOriginal;

                                /// Venda
                                if (item.Operation == "C") {
                                    carteiraTemporaria[item.Reference].valor = carteiraTemporaria[item.Reference].valor * -1;
                                    carteiraTemporaria[item.Reference].volumeOriginal = carteiraTemporaria[item.Reference].volumeOriginal * -1;
                                    carteiraTemporaria[item.Reference].volume = carteiraTemporaria[item.Reference].volumeOriginal;
                                }

                            } else if (item.Currency == "BTC") {
                                carteiraTemporaria[item.Reference].volumeOriginal = item.Amount / 1e8;
                                carteiraTemporaria[item.Reference].volume += item.Amount / 1e8;
                            }
                        } else if ((item.Description == "TF") && (item.Operation == "D")) {
                            carteiraTemporaria[item.Reference].volume -= item.Amount / 1e8;
                        }
                    }
                }

                var novaProfundidade = profundidadeDaCarteira - tamanhoPagina;
                if ((tamanhoPagina == 0) || (novaProfundidade <= 0)) {

                    for (i in carteiraTemporaria) {
                        if (carteiraTemporaria.hasOwnProperty(i)) {
                            adicionarCompra(round(carteiraTemporaria[i].valor, 2), round(carteiraTemporaria[i].volume, 8), carteiraTemporaria[i].volumeOriginal);
                        }
                    }

                    okDel();
                } else {
                    atualizarCarteira(dataBase, okDel, nokDel, novaProfundidade, (pagina + 1), carteiraTemporaria);
                }

            })
            .catch((Exc) => {
                plnErro("Deu ruim na posição", Exc);
                publico.iniciar(true);
            });
    }

    function trataOrdens() {

        var estadoExecucao = publico.status().pln();
        if (!estadoExecucao.ok) {
            return;
        }

        var valorVenda = estadoExecucao.valorVenda,
            valorMedioDaCarteira = estadoExecucao.valorMedioDaCarteira,
            melhorOfertaCompraAtual = estadoExecucao.melhorOfertaCompraAtual,
            melhorOfertaVendaAtual = estadoExecucao.melhorOfertaVendaAtual,
            volumeTotal = estadoExecucao.volumeTotal,
            saldoBRL = estadoExecucao.saldoBRL,
            saldoBTCBRL = estadoExecucao.saldoBTCBRL,
            saldoBrutoBRL = estadoExecucao.saldoBrutoBRL;

        /// Algumas vezes os dados do topo do book fica poluido - IDK why
        if (!melhorOfertaVendaAtual || !melhorOfertaCompraAtual) {
            plnErro("Topo do book tá cagado", estadoExecucao);
            return;
        }

        /// Caso já tenhamos uma ordem executada
        if (params.comprado) {

            pln("Executando comprado...");

            var vendaParcial = parametrosDefault.vendaParcial;
            var volumeQuePodeSerVendido = podemosVenderPor(melhorOfertaCompraAtual);
            if ((vendaParcial === true) && (volumeQuePodeSerVendido > 0)) {

                pln(("Desfazendo de volume com lucro: " + volumeQuePodeSerVendido));
                adicionarOrdemVenda(melhorOfertaCompraAtual, volumeQuePodeSerVendido, (r) => {
                    if (r) {
                        limparCompras(melhorOfertaCompraAtual);
                    }
                }, () => {});

            } else if (melhorOfertaCompraAtual > valorVenda) {
                if (params.subindo) {
                    if (params.ultimaMelhorOferta <= melhorOfertaCompraAtual) {

                        pln("Mercado continua subindo!!");
                        params.ultimaMelhorOferta = melhorOfertaCompraAtual;

                    } else {

                        /// Ops, começando a descer, melhor sair!!
                        pln("Vendendo por " + melhorOfertaCompraAtual, true);

                        /// Atualiza o valor máximo que podemos usar pra comprar pois o mercado se provou neste novo patamar
                        if (melhorOfertaCompraAtual > params.valorMaximoCompra) {
                            params.valorMaximoCompra = melhorOfertaCompraAtual;
                        }

                        /// Vende tudo!!!
                        adicionarOrdemVenda(melhorOfertaCompraAtual, obterVolumeTotal(), (r) => {
                            if (r) {
                                pln("FINALIZADO!");
                            }
                        }, () => {});

                    }

                } else {

                    /// Inicia leitura do mercado
                    pln("Mercado subindo!!");
                    params.ultimaMelhorOferta = melhorOfertaCompraAtual;
                    params.subindo = true;
                }

            } else {

                if ((saldoBRL < params.valorOrdem) || (obterValorTotalGasto() >= params.maximoGastos)) {

                    /// Gastamos tudo...
                    pln(" - Gastamos todo o orçamento. Agora tem que rezar.");
                    pln(`   Valor total gasto: R$ ${obterValorTotalGasto()}`);
                    pln(`   Máximo de gastos: R$ ${params.maximoGastos}`);

                } else {


                    /// Vamos tentar diminuir o custo médio comprando na variação do mercado                   
                    if (melhorOfertaVendaAtual > valorMedioDaCarteira) {
                        pln("O mercado está subindo, e ele tem talento pra isso!! Melhor oferta de venda atual: R$ " + melhorOfertaVendaAtual + ".");
                    } else if (devemosComprarNoValor(melhorOfertaVendaAtual)) {

                        if (melhorOfertaVendaAtual < params.valorMinimoCompra) {
                            pln("Mercado caiu de mais. Vamos aguardar");
                            return;
                        }

                        pln("- Tentando melhorar média de saída...");
                        pln(`  Adicionando posição por ${melhorOfertaVendaAtual} enviando uma ordem de R$ ${obterValorOrdemCompra(melhorOfertaVendaAtual)}`);
                        var volume = (obterValorOrdemCompra(melhorOfertaVendaAtual) / melhorOfertaVendaAtual);
                        adicionarOrdemCompra(melhorOfertaVendaAtual, volume, (r) => {
                            if (r) {

                                params.subindo = false;

                            } else {
                                plnErro("  Deu RUIM", r);
                            }
                        }, () => {});

                    } else if (melhorOfertaVendaAtual > params.valorMaximoCompra) {

                        pln(`  Muito caro. Valor máximo para compra: R$ ${params.valorMaximoCompra}`);

                    } else {

                        pln(`  Já temos posição em: R$ ${parseInt(melhorOfertaVendaAtual)}`);

                    }
                }
            }
        }

        /// Estamos esperando o momento de entrar no mercado e montar posição
        else {

            pln("Executando sem posição...");

            if (melhorOfertaVendaAtual <= params.valorMaximoCompra) {

                pln(`Comprando por R$ ${melhorOfertaVendaAtual}`);
                var volume = (params.valorOrdem / melhorOfertaVendaAtual);
                adicionarOrdemCompra(melhorOfertaVendaAtual, volume, (r) => {
                    if (r) {

                        params.subindo = false;

                    } else {
                        plnErro("Deu RUIM", r);
                    }
                }, () => {});

            } else {

                pln(`Muito caro. Melhor oferta atual: R$ ${melhorOfertaVendaAtual}.`);

            }
        }
    }

    function StatusAplicacao() {
        var base = {
            ok: true,
            detalhes: [],
            titulo: "",
            add: (detalhe, erro) => {
                base.detalhes.push(detalhe);
                if (erro) {
                    base.ok = false;
                    base.tit(detalhe);
                }
                return base;
            },
            tit: function (txt) {
                base.titulo = txt;
                return base;
            },
            html: () => {
                var txt = `<html><head><title>Algodinha - ${base.titulo}</title> 
                            <meta http-equiv="refresh" content="10"> 
                            <meta name="apple-mobile-web-app-status-bar-style" content="black"> 
                            <meta name="apple-mobile-web-app-capable" content="yes">
                            <meta name="viewport" content="width=device-width">
                            <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.7.1/Chart.bundle.js"></script><body><div>`;

                for (var i = 0; i < base.detalhes.length; i++) {
                    txt += `${base.detalhes[i]} <br> `;
                }

                txt += `<strong>Última mensagem: </strong> ${params.ultimoPln}
                        </div>${getHtmlChart()}</body></html>`;

                return txt;
            },
            pln: () => {
                for (var i = 0; i < base.detalhes.length; i++) {
                    if (base.ok) {
                        pln(base.detalhes[i]);
                    } else {
                        pln(base.detalhes[i], true);
                    }
                }
                return base;
            },
            ext: (obj) => {
                for (i in obj) {
                    base[i] = obj[i];
                }
                return base;
            }
        };

        return base;
    }

    function getHtmlChart() {

        var dados = "[]";

        if (params.compras) {

            var compras = clone(params.compras).sort((a, b) => {
                return a.valor == b.valor ? a.volume < b.volume ? -1 : 1 : a.valor < b.valor ? -1 : 1;
            });

            var resultado = {
                labels: [],
                datasets: [{
                    label: ["Distribuição: Volume/Valor"],
                    fill: false,
                    backgroundColor: 'rgb(54, 162, 235)',
                    borderColor: 'rgb(54, 162, 235)',
                    data: []
                }]
            };

            for (var i = 0; i < compras.length; i++) {
                var compra = compras[i];
                if (compra.valor > 0) { 
                    var valorCompra = compra.valor.toFixed("2");
                    var volume = compra.volume.toFixed(8);
                    resultado.labels.push(valorCompra);
                    resultado.datasets[0].data.push({
                        x: valorCompra,
                        y: volume
                    });
                }
            }

            dados = JSON.stringify(resultado);
        }

        return `<div style='width:75%;'><canvas id='myChart' width='800' height='600'></canvas></div> 
                <script> 
                var ctx = document.getElementById('myChart').getContext('2d'); 
                var myChart = Chart.Line(ctx, { 
                   data:  ${dados}, 
                   options: { 
                      responsive: false, 
                      title : { display:true, text:'Posição atual' },  
                      scales: {
                          xAxes: [{
                              display: true, 
                              scaleLabel: {
                                  display: true,
                                  labelString: 'Valor BTC'
                              }
                          }],
                          yAxes: [{
                              display: true,
                              scaleLabel: {
                                  display: true,
                                  labelString: 'Volume'
                              }
                          }]
                      }
                   }  
                }); 
                </script>`;
    }

    var publico = {
        status: (hideHeader) => {

            var resultado = new StatusAplicacao();

            try {

                if (!hideHeader) {
                    resultado
                        .add("----------------------------------------------------------------------------------------------------------------")
                        .add("");
                }

                if (params.offline) {
                    return resultado.add("Disconectado!", true).add("");
                }

                if (params.iniciando) {
                    return resultado.add("Iniciando...", true).add("");
                }

                if (params.aguardandoOrdem) {
                    return resultado.add("Aguardando execução da última ordem", true).add("");
                }

                var o = params.book,
                    volumeTotal = obterVolumeTotal();
                if (!o || !o.asks || !o.bids || !o.bids[0] || !o.asks[0] || isNaN(volumeTotal)) {
                    return resultado.add("Deu ruim", true).add("");
                }

                var melhorOfertaCompraAtual = o.bids[0],
                    saldoBTCBRL = (volumeTotal * melhorOfertaCompraAtual),
                    valorMedioCompras = obterValorMedioCompras();

                resultado
                    .ext({
                        valorVenda: obterValorVenda(),
                        valorMedioDaCarteira: obterValorVendaPara(valorMedioCompras),
                        valorMedioDaCarteiraReal: valorMedioCompras,
                        melhorOfertaCompraAtual: melhorOfertaCompraAtual,
                        melhorOfertaVendaAtual: o.asks[0],
                        volumeTotal: volumeTotal,
                        saldoBRL: params.saldoBRL,
                        saldoBTCBRL: saldoBTCBRL,
                        saldoBrutoBRL: (params.saldoBRL + saldoBTCBRL)
                    })
                    .tit(`Saldo R$ ${resultado.saldoBrutoBRL.toFixed(3)}`)
                    .add("STATUS ATUAL DA CARTEIRA:")
                    .add(`    - Saldo atual: R$ ${resultado.saldoBRL.toFixed(2)}`)
                    .add(`    - Saldo BTC em BRL: R$ ${resultado.saldoBTCBRL.toFixed(2)}`)
                    .add(`    - Saldo total atual (Bruto): R$ ${resultado.saldoBrutoBRL.toFixed(2)}`)
                    .add(`    - Saldo total atual (Líquido): R$ ${(resultado.saldoBrutoBRL - (resultado.saldoBrutoBRL * params.taxaDaCorretora)).toFixed(2)}`)
                    .add("")
                    .add(`    - Valor médio das compras: R$ ${resultado.valorMedioDaCarteira.toFixed(3)} - Real:${resultado.valorMedioDaCarteiraReal.toFixed(3)}`)
                    .add(`    - Volume total: BTC ${resultado.volumeTotal}`)
                    .add(`    - Target de venda: R$ ${resultado.valorVenda.toFixed(2)}`)
                    .add(`    - Volume com delta positivo: BTC ${podemosVenderPor(melhorOfertaCompraAtual).toFixed(8)}`)
                    .add(`    - Delta de saída em: ${(((resultado.valorVenda - resultado.melhorOfertaCompraAtual)/resultado.valorVenda)*100).toFixed(2)}%`)
                    .add(`    - Túnel: Min: ${params.ultimaCompra.min}, Max: ${params.ultimaCompra.max}`)
                    .add("")
                    .add(`    - Valor máximo para compra: R$ ${params.valorMaximoCompra}`)
                    .add(`    - Máximo de gastos: R$ ${params.maximoGastos}`)
                    .add(`    - Valor investido: R$ ${obterValorTotalGasto().toFixed(2)}`)
                    .add("")
                    .add("STATUS ATUAL DO MERCADO:")
                    .add(`    - Compra: R$ ${resultado.melhorOfertaCompraAtual.toFixed(3)}`)
                    .add(`    - Venda: R$ ${resultado.melhorOfertaVendaAtual.toFixed(3)}`)
                    .add("");

            } catch (Exc) {
                return resultado.add(Exc, false);
            }

            return resultado;
        },
        iniciar: (forcar) => {

            if (!forcar && (params && (params.iniciando === true))) {
                pln("Processo de inicialização já em execução...");
                return;
            }

            params = clone(parametrosDefault);
            params.offline = true;

            var ws = obterWS();

            params.iniciando = true;

            /// Conecta na Exchange
            pln("Conectando...");
            ws.connect().then(() => {

                    pln("Realizando o login...");
                    return ws.login({
                        username: params.security.user,
                        password: params.security.password
                    });

                })
                .then(() => {

                    pln("Obtendo posição atual...");
                    ws.balance()

                        .then((extrato) => {
                            pln("Posição obtida!");
                            params.saldoBRL = ((extrato.Available.BTC ? extrato.Available.BRL : extrato[params.idCorretora].BRL) / 1e8);
                        })
                        .then((logged) => {

                            if (parametrosDefault.iniciaComprado === true) {

                                carregarBook(ws);

                            } else {

                                pln("Atualizando a carteira...");
                                var dataBase = new Date(params.dataBase);
                                atualizarCarteira(dataBase, () => {
                                    carregarBook(ws);
                                }, () => {
                                    plnErro("Problema ao obter carteira", e);
                                    params.iniciando = false;
                                    publico.iniciar();
                                });
                            }

                        }).catch((e) => {
                            plnErro("Problema ao atualizar posição/carteira", e);
                            params.iniciando = false;
                            publico.iniciar();
                        });

                })
                .catch((e) => {
                    plnErro("Problema ao registrar pra execution report", e);
                    params.iniciando = false;
                    publico.iniciar();
                });
        }
    };

    return publico;
}

var algodinha = new AlgoDinha();

require("http").createServer(function (request, response) {
    response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
    });
    response.end(algodinha.status(true).html());
}).listen(1337);

algodinha.iniciar();