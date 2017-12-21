
var AlgoDinha = function() { 
    
    var BlinkTradeWS = require("blinktrade").BlinkTradeWS,
        colors = require("colors"),
        gmailSend = require("gmail-send");

    colors.setTheme({
        erro: ["red", "underline"],
        aviso: ["yellow", "bold"],
        ok: ["green", "bold"],
        comprado: ["blue"],
        vendido: ["magenta"],
        titulo: ["white", "bold"]
    });

    var parametrosDefault = {

        /// Estado da aplicação
        security : require("./api.json"), 
        email : require("./mail.json"), 
        compras : [],
        ultimaMelhorOferta : null,
        book : { bids:[], asks:[] },
        taxaDaCorretora : 0.005,
        aguardandoOrdem : false,
        comprado : false,
        subindo : false,
        saldoBRL : 0,
        profundidadeBuscaCarteira : 5000,
        offline : false,
        heartbeatEnviado : false,
        simboloBTC : "BTCBRL",
        idCorretora : "4", /// Foxbit
        iniciando : false,
        ultimaCompra : {min: 0, max: 0, realizada:false},
        ultimoPln : "",
        instanciaWS : null,

        //////////////////////////////////////////////////////////////////////////
        /// Parâmetros da execução
        //////////////////////////////////////////////////////////////////////////

        /// Valor máximo para compra de BTC
        valorMaximoCompra : 52000,

        /// Valor mínimo para compra de BTC (base do túnel de negociação)
        valorMinimoCompra : 47000,

        /// Valor máximo que o robô está autorizado a gastar
        maximoGastos : 3700 + 100,

        /// Valor das ordens de compra enviadas pelo robô
        valorOrdem : 10,

        /// Threshold que define o momento de rebalanceamento do valor de saída
        ///     - O robô faz uma média ponderada com os valores das compras e utiliza esta informação para 
        ///       decidir a melhor hora para sair
        thresholdRecompraEmBRL : 50,

        /// Lucro % esperado
        lucroEsperado : 0.01,

        //// Data da última venda realizada na plataforma ou, qualquer data no futuro caso vc
        //// opte por iniciar vendido
        dataBase : "2017-12-19 11:15:21"

        //////////////////////////////////////////////////////////////////////////
        
    },

    /// Objeto com os valores "quentes" para operação
    params = null;

    function obterWS() {

        if (!params) { 
            pln("Parametros não inicializados.".erro);
            return null;
        } 

        if (!params.instanciaWS || (params.offline && !params.iniciando)) { 
            pln("Obtendo nova instância de WS".aviso);
            params.instanciaWS = new BlinkTradeWS( { prod: true })
        }
        
        return params.instanciaWS;
    }

    function enviaEmail(assunto, texto) { 
        gmailSend()({
            user: params.email.email,
            pass: params.email.appPass,
            to:   params.email.destino,
            subject: "[Algodinha] " + assunto,
            text:    texto
        }, function (err, res) {
            if (err) { 
                console.log("Erro ao enviar email:", err, assunto, texto);
            }
        });
    }

    function clone(obj) { 
        return JSON.parse(JSON.stringify(obj));
    }
       
    function pln(str, warn) { 
        params.ultimoPln = str;
        if (!warn) { 
            console.info(str);
        } else { 
            console.warn(str.aviso);
        }
    }

    function trataNegociacao(ordem, parcial) { 
        obterWS().balance().then(function(extrato) { 

            var novoSaldoBRL = ((extrato.Available.BTC ? extrato.Available.BRL : extrato[params.idCorretora].BRL) / 1e8);
            var tipoExecucao = parcial ? "parcialmente" : "totalmente";

            if (ordem.Side == "1") { 
                
                var saldoAnterior = obterVolumeTotal();
                var disponivel = ((extrato.Available.BTC ? extrato.Available.BTC : extrato[params.idCorretora].BTC) / 1e8);
                
                if (saldoAnterior > 0) { 
                    
                    var executado = ordem.LastShares / 1e8;
                    disponivel = (disponivel + executado) - (saldoAnterior + executado);
                    
                }
                
                enviaEmail("Ordem de compra " + tipoExecucao + " executada!", "Valor: R$ " + (ordem.LastPx / 1e8) + " - Volume: " + disponivel);
                adicionarCompra((ordem.LastPx / 1e8), disponivel, 0, true);

            } else { 
                
                console.log("Vendeu", ordem, novoSaldoBRL, params.saldoBRL);
                enviaEmail("Ordem de venda " + tipoExecucao + " executada!", "Novo saldo: R$" + novoSaldoBRL  + " - Valor: R$ " + (ordem.LastPx / 1e8) + " - Volume: " + disponivel);
                
                params.comprado = (obterVolumeTotal() > 0);
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
    
    function atualizaBook(item){ 
        
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
        
        if (params.compras && params.compras.length > 0) { 
            return params.compras.length * params.valorOrdem;
        }
    
        return 0;
    
    }
    
    function obterValorMedioCompras() { 
    
        if (params.compras && params.compras.length > 0) { 
            var valorTotal = 0;
            for (var i = 0; i < params.compras.length; i++) { 
                if (!isNaN(params.compras[i].volume) ) { 
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
            pln(("Valor não pode ser arredondado: " + value).erro);
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
        params.compras.push({valor:valor, volume:volume, volumeOriginal:volumeOriginal});
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
                    if (obterValorVendaPara(params.compras[i].valor) < oferta) { 
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
        require("dns").resolve("www.google.com", function(err) {
            if (err) {
                console.log("Vish... Caimos!");
                off();
            } else {
                on();
            }
        });
    }

    function devemosComprarNoValor(valor) {

        valor = parseInt(valor);

        /// Dentro do túnel de estabilidade
        if ((valor > params.valorMaximoCompra) 
            || (params.ultimaCompra.realizada && (params.ultimaCompra.min <= valor) && (params.ultimaCompra.max >= valor))) { 
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
                if (obterValorVendaPara(compra.valor) < preco) { 
                    volumeQuePodeSerVendidoComLucro += params.compras[i].volume;
                }
            }
            return volumeQuePodeSerVendidoComLucro;
        }
        return 0;
    }
    
    function adicionarOrdem(preco, volume, tipo, okDel, nokDel) { 
        try{

            if (preco == 0) { 
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
                function(ok){ 

                    var tipoOrdem = tipo == "1" ? "compra" : "venda";
                    enviaEmail("Ordem de " + tipoOrdem + " colocada com sucesso!", "Valor: R$ " + preco + " - Volume: " + volume);

                    console.warn("Ordem colocada com sucesso!".aviso, ok);
                    okDel(ok);
                    pln(""); pln(""); pln("");
                    pln(""); pln(""); pln("");
                }
            ).catch(
                function (nok) { 

                    console.error("Falha ao enviar ordem".erro, nok); 
                    nokDel(nok); 
                }
            );

        } catch(E) { 
            console.error("Falha na infra de ordem".erro, nok); 
            nokDel(E);
        }
    }

    function enviarBatida() { 
        var intervaloAtual = setInterval(function() { 

            if (params.heartbeatEnviado) { 
                console.error("Timeout no heartbeat.".erro);
                params.offline = true;
            }

            params.heartbeatEnviado = true;
            checkPing(
                function() { 
                    
                    if (params.offline) { 
                        params.offline = false;
                        clearInterval(intervaloAtual);
                        publico.iniciar();
                        return;
                    }
                    
                    params.offline = false;
                    console.log(colors.grey.italic(" <3  "));
                    obterWS().heartbeat(function() { 
                        console.log(" <3 ".grey);
                        params.heartbeatEnviado = false;
                    })
                    .catch(function(E) {
                        console.error("Heartbeat falhou".erro, E);
                        params.offline = true;
                        params.heartbeatEnviado = false;
                    });
                },
                function() { 
                    console.error("Internet morreu. RIP".erro);
                    params.offline = true;
                }
            );
        }, 10000 /*Every ten seconds*/);
    }
    
    function atualizarCarteira(dataBase, okDel, nokDel, profundidadeDaCarteira, pagina, carteiraTemporaria) { 
        profundidadeDaCarteira = profundidadeDaCarteira ? profundidadeDaCarteira : params.profundidadeBuscaCarteira;
        pagina = pagina ? pagina : 0;
        carteiraTemporaria = carteiraTemporaria ? carteiraTemporaria : {};

        return obterWS().requestLedger( { page: pagina, pageSize: profundidadeDaCarteira })
            .then(function(historico) { 
                
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
                            carteiraTemporaria[item.Reference] = { valor: 0, volume: 0, timestamp : item.Created};
                        }

                        if (item.Description == "T") { 
                                if (item.Currency == "BRL") { 
                                    if (!carteiraTemporaria[item.Reference].volumeOriginal) { 
                                        console.error("Deu PAU!!!!!! Falta volume original!!".erro);
                                        nokDel();
                                        return;
                                    }
                                    carteiraTemporaria[item.Reference].valor = (item.Amount / 1e8) / carteiraTemporaria[item.Reference].volumeOriginal;
                                } else if (item.Currency == "BTC") { 
                                    carteiraTemporaria[item.Reference].volumeOriginal = item.Amount / 1e8;
                                    carteiraTemporaria[item.Reference].volume += item.Amount / 1e8;
                                }
                            } else if (item.Description == "TF") { 
                                carteiraTemporaria[item.Reference].volume -= item.Amount / 1e8;
                            }
                        }
                    }

                    var novaProfundidade = profundidadeDaCarteira - tamanhoPagina;
                    if ((tamanhoPagina == 0) || (novaProfundidade <= 0)) { 
                        
                        for(i in carteiraTemporaria) { 
                            if (carteiraTemporaria.hasOwnProperty(i) && (carteiraTemporaria[i].volume > 0)) { 
                                adicionarCompra(round(carteiraTemporaria[i].valor, 2), round(carteiraTemporaria[i].volume, 8), carteiraTemporaria[i].volumeOriginal);
                            }
                        }
    
                        okDel();
                    } else { 
                        atualizarCarteira(dataBase, okDel, nokDel, novaProfundidade, (pagina+1), carteiraTemporaria);
                    }
                    
                })
            .catch(function(Exc) {
                console.error("Deu ruim na posição".erro, Exc);
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
        
        /// Caso já tenhamos uma ordem executada
        if (params.comprado) { 
            
            pln("Executando comprado...".comprado);

            ///////////////////////////////////////////////////////////////////////////////////////////
            // var volumeQuePodeSerVendido = podemosVenderPor(melhorOfertaCompraAtual);
            // if (volumeQuePodeSerVendido > 0) { 

            //     pln(("Desfazendo de volume com lucro: " + volumeQuePodeSerVendido).comprado);
            //     adicionarOrdemVenda(melhorOfertaCompraAtual, volumeQuePodeSerVendido, function(r) { 
            //         if (r) { 
            //             limparCompras(melhorOfertaCompraAtual);
            //         }
            //     }, function() { });

            // } 
            // else 
            ///////////////////////////////////////////////////////////////////////////////////////////

            if (melhorOfertaCompraAtual > valorVenda) { 
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
                        adicionarOrdemVenda(melhorOfertaCompraAtual, obterVolumeTotal(), function(r) { 
                            if (r) { 
                                console.log("FINALIZADO!");
                            }
                        }, function() { });
    
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
    
                } else { 
    
                    
                    /// Vamos tentar diminuir o custo médio comprando na variação do mercado                   
                    if (melhorOfertaVendaAtual > valorMedioDaCarteira) { 
                        pln("O mercado está subindo, e ele tem talento pra isso!! Melhor oferta de venda atual: R$ " + melhorOfertaVendaAtual + ".");
                    }
                    else if (devemosComprarNoValor(melhorOfertaVendaAtual)) { 
    
                        if (melhorOfertaVendaAtual < params.valorMinimoCompra) { 
                            pln("Mercado caiu de mais. Vamos aguardar".aviso);
                            return;
                        }

                        pln("- Tentando melhorar média de saída...");
                        pln("  Adicionando posição por " + melhorOfertaVendaAtual, true);
                        var volume = (params.valorOrdem / melhorOfertaVendaAtual);
                        adicionarOrdemCompra(melhorOfertaVendaAtual, volume, function(r) { 
                            if (r) { 
    
                                params.subindo = false;
    
                            } else { 
                                console.warn("  Deu RUIM", r);
                            }
                        }, function() { });
    
                    } else if (melhorOfertaVendaAtual > params.valorMaximoCompra) { 

                        pln("  Muito caro. Valor máximo para compra: R$ " + params.valorMaximoCompra);
                                        
                    } else {
    
                        pln("  Já temos posição em: R$ " + parseInt(melhorOfertaVendaAtual));
    
                    }
                }
            }
        }
    
        /// Estamos esperando o momento de entrar no mercado e montar posição
        else { 
    
            pln("Executando sem posição...".vendido);
   
            if (melhorOfertaVendaAtual <= params.valorMaximoCompra) { 
    
                pln("Comprando por " + melhorOfertaVendaAtual, true);
                var volume = (params.valorOrdem / melhorOfertaVendaAtual);
                adicionarOrdemCompra(melhorOfertaVendaAtual, volume, function(r) { 
                    if (r) { 
    
                        params.subindo = false;
                        
                    } else { 
                        console.warn("Deu RUIM", r);
                    }
                }, function() { });
    
            } else { 
    
                pln("Muito caro. Melhor oferta atual: " + melhorOfertaVendaAtual + ".");
    
            }
        }
    }

    function StatusAplicacao() { 
        var base = {
            ok : true, 
            detalhes: [],
            add : function(detalhe, erro) { 
                base.detalhes.push(detalhe);
                if (erro) { 
                    this.ok = false;
                }
                return base;
            },
            html : function() { 
                var txt = "<html><head><title>Algodinha</title>" + 
                            "<meta http-equiv=\"refresh\" content=\"10\">" + 
                            "<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black\">" + 
                            "<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">" + 
                            "<meta name=\"viewport\" content=\"width=device-width\">" + 
                            "<script src=\"https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.7.1/Chart.bundle.js\"></script><body><div>";
                for (var i=0; i < base.detalhes.length; i++) { 
                    txt += base.detalhes[i] + "<br>";
                }
                txt += "<strong>Último pln: </strong>" + params.ultimoPln;
                txt += "</div>" + getHtmlChart() + "</body></html>";
                return txt;
            }, 
            pln :function() { 
                for (var i=0; i < base.detalhes.length; i++) { 
                    if (base.ok) { 
                        pln(base.detalhes[i]);
                    } else { 
                        pln(base.detalhes[i].erro);
                    }
                }
                return base;
            },
            ext : function(obj) { 
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

            var compras = clone(params.compras).sort(function(a, b) { 
                return a.valor == b.valor ? a.volume < b.volume ? -1 : 1 : a.valor < b.valor ? -1 : 1;
            });

            var resultado = {
                    labels: [],
                    datasets : [{
                        label : ["Distribuição: Volume/Valor"],
                        fill: false,
                        backgroundColor: 'rgb(54, 162, 235)',
                        borderColor: 'rgb(54, 162, 235)',
                        data : []
                    }]
                };

            for (var i=0; i < compras.length; i++) {
                var compra = compras[i];
                var valorCompra = compra.valor.toFixed("2");
                var volume = compra.volume.toFixed(8);
                resultado.labels.push(valorCompra);
                resultado.datasets[0].data.push({ x: valorCompra, y: volume});
            }
            
            dados = JSON.stringify(resultado);
        }

        return "<div style='width:75%;'><canvas id='myChart' width='800' height='600'></canvas></div>" + 
                "<script>" + 
                "var ctx = document.getElementById('myChart').getContext('2d');" + 
                "var myChart = Chart.Line(ctx, {" + 
                "    data: " + dados +  "," + 
                "    options: {" + 
                "       responsive: false," + 
                "       title : { display:true, text:'Posição atual' }, " + 
                "       scales: {" +
                "           xAxes: [{" +
                "               display: true," + 
                "               scaleLabel: {" +
                "                   display: true," +
                "                   labelString: 'Valor BTC'" +
                "               }" +
                "           }]," +
                "           yAxes: [{" +
                "               display: true," +
                "               scaleLabel: {" +
                "                   display: true," +
                "                   labelString: 'Volume'" +
                "               }" +
                "           }]" +
                "       }" +
                "    } " + 
                "});" + 
                "</script>";
    }
  
    var publico = { 
        status : function(hideHeader) { 
            
            var resultado = new StatusAplicacao();

            try { 
                
                if (!hideHeader) { 
                    resultado
                        .add("----------------------------------------------------------------------------------------------------------------".titulo)
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
                    saldoBTCBRL = (volumeTotal * melhorOfertaCompraAtual);

                resultado
                    .ext({
                        valorVenda : obterValorVenda(),
                        valorMedioDaCarteira : obterValorVendaPara(obterValorMedioCompras()),
                        melhorOfertaCompraAtual : melhorOfertaCompraAtual,
                        melhorOfertaVendaAtual : o.asks[0],
                        volumeTotal : volumeTotal,
                        saldoBRL : params.saldoBRL,
                        saldoBTCBRL : saldoBTCBRL,
                        saldoBrutoBRL : (params.saldoBRL + saldoBTCBRL)
                    })
                    .add("STATUS ATUAL DA CARTEIRA:")
                    .add("    - Saldo atual: R$ " + resultado.saldoBRL.toFixed(2))
                    .add("    - Saldo BTC em BRL: R$ " + resultado.saldoBTCBRL.toFixed(2))
                    .add("    - Saldo total atual (Bruto): R$ " + resultado.saldoBrutoBRL.toFixed(2))
                    .add("    - Saldo total atual (Líquido): R$ " + (resultado.saldoBrutoBRL - (resultado.saldoBrutoBRL * params.taxaDaCorretora)).toFixed(2))
                    .add("")
                    .add("    - Valor médio das compras: R$ " + resultado.valorMedioDaCarteira.toFixed(3))
                    .add("    - Volume total: BTC " + resultado.volumeTotal)
                    .add("    - Target de venda: R$ " + resultado.valorVenda.toFixed(2))
                    .add("    - Volume com delta positivo: BTC " + podemosVenderPor(melhorOfertaCompraAtual))
                    .add("    - Delta de saída em: " + (((resultado.valorVenda - resultado.melhorOfertaCompraAtual)/resultado.valorVenda)*100).toFixed(2) + "%")
                    .add("    - Túnel: Min: " + params.ultimaCompra.min + ", Max: " + params.ultimaCompra.max)
                    .add("")
                    .add("    - Valor máximo para compra: R$ " + params.valorMaximoCompra)
                    .add("    - Máximo de gastos: R$ " + params.maximoGastos)
                    .add("    - Valor investido: R$ " + obterValorTotalGasto())
                    .add("")
                    .add("")
                    .add("STATUS ATUAL DO MERCADO:")
                    .add("    - Compra: R$ " + resultado.melhorOfertaCompraAtual.toFixed(3))
                    .add("    - Venda: R$ " + resultado.melhorOfertaVendaAtual.toFixed(3))
                    .add("");
            
            } catch (Exc) { 
                return resultado.add(Exc, false);
            }

            return resultado;
        },
        iniciar : function(forcar) { 

            if (!forcar && (params && (params.iniciando === true))) { 
                pln("Processo de inicialização já em execução...".aviso);
                return;
            } 
            
            params = clone(parametrosDefault);
            params.offline = true;
            
            var ws = obterWS();
            
            params.iniciando = true;
            
            /// Conecta na Exchange
            pln("Conectando...".aviso);
            ws.connect().then(function() {
                
                pln("Realizando o login...".titulo);
                return ws.login({ username: params.security.user, password: params.security.password });
                
            })
            .then(function() { 
                
                pln("Obtendo posição atual...".aviso);
                ws.balance()

                    .then(function(extrato) { 
                        pln("Posição obtida!".ok);
                        params.saldoBRL = ((extrato.Available.BTC ? extrato.Available.BRL : extrato[params.idCorretora].BRL) / 1e8);
                    })
                    .then(function(logged) {
                
                        pln("Atualizando a carteira...".aviso);
                        var dataBase = new Date(params.dataBase);
                        atualizarCarteira(dataBase, function() {

                            ws.executionReport()
                            .on("EXECUTION_REPORT:PARTIAL", execucaoParcial)
                            .on("EXECUTION_REPORT:EXECUTION", execucaoTotal);
                            
                            pln("Obtendo snapshot do book...".titulo);
                            ws.subscribeOrderbook([params.simboloBTC])
                                .on("OB:NEW_ORDER", atualizaBook)
                                .on("OB:UPDATE_ORDER", atualizaBook)
                                .then(function(fullBook) { 
                                
                                    pln("Sucesso!".ok);
                                    params.iniciando = false;
                                    params.offline = false;
                                    enviarBatida();
                                    var dadosDoBook = fullBook.MDFullGrp[params.simboloBTC];
                                    params.book = { asks:dadosDoBook.asks[0], bids:dadosDoBook.bids[0] };
                                    trataOrdens();
                        
                                })
                                .catch(function(EE) {
                                    console.error("Erro na assinatura do book.".erro, EE);
                                    params.iniciando = false;
                                    publico.iniciar();
                                });

                    }, function() {
                        console.error("Problema ao obter carteira".erro, e);
                        params.iniciando = false;
                        publico.iniciar();
                    });
                
                }).catch(function(e){ 
                    console.error("Problema ao atualizar posição/carteira".erro, e);
                    params.iniciando = false;
                    publico.iniciar();
                });

            })
            .catch(function(e){ 
                console.error("Problema ao registrar pra execution report".erro, e);
                params.iniciando = false;
                publico.iniciar();
            });
        }
    };

    return publico;
}

var algodinha = new AlgoDinha();

require("http").createServer(function (request, response) {
    response.writeHead(200, 
    { 
        "Content-Type": "text/html; charset=utf-8", 
        "Access-Control-Allow-Origin" : "*",
        "Cache-Control": "no-cache"
    });
    response.end(algodinha.status(true).html());
}).listen(1337);

algodinha.iniciar();