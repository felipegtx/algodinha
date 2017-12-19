
var AlgoDinha = function() { 
    
    var BlinkTradeWS = require("blinktrade").BlinkTradeWS,
        blinktradeWs = new BlinkTradeWS( { prod: true }),
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
        profundidadeBuscaCarteira : 1000,
        offline : false,
        heartbeatEnviado : false,
        simboloBTC : "BTCBRL",
        idCorretora : "4", /// Foxbit

        //////////////////////////////////////////////////////////////////////////
        /// Parâmetros da execução
        //////////////////////////////////////////////////////////////////////////

        /// Valor máximo para compra de BTC
        valorMaximoCompra : 70000,

        /// Valor mínimo para compra de BTC (base do túnel de negociação)
        valorMinimoCompra : 66900,

        /// Valor máximo que o robô está autorizado a gastar
        maximoGastos : 3000,

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
        if (!warn) { 
            console.info(str);
        } else { 
            console.warn(str.aviso);
        }
    }

    function trataNegociacao(ordem, parcial) { 
        blinktradeWs.balance().then(function(extrato) { 

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
                adicionarCompra((ordem.LastPx / 1e8), disponivel);

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
                valorTotal += params.compras[i].valor * params.compras[i].volume;
            }
            return valorTotal / obterVolumeTotal();
        }
    
        return 0;
    }
    
    function round(value, decimals) {
        /// NASTY! mas funfa.
        return Number(Math.round(value + "e" + decimals) + "e-" + decimals);
    }

    function obterVolumeTotal() { 
        
        if (params.compras && params.compras.length > 0) { 
            var volumeTotal = 0;
            for (var i = 0; i < params.compras.length; i++) { 
                volumeTotal += params.compras[i].volume;
            }
            return round(volumeTotal, 8);
        }
        
        return 0;
    }

    function obterVolumeTotalReal() { 
        
        if (params.compras && params.compras.length > 0) { 
            var volumeTotal = 0;
            for (var i = 0; i < params.compras.length; i++) { 
                volumeTotal += params.compras[i].volumeOriginal;
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
    
    function adicionarCompra(valor, volume, volumeOriginal) { 
        params.comprado = true;
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

    function existemComprasNoValor(valor) {
        valor = parseInt(valor);
        if (params.compras && params.compras.length > 0) { 
            for (var i = 0; i < params.compras.length; i++) { 
                if (parseInt(params.compras[i].valor) == valor) { 
                    return true;
                }
            }
        }
        return false;
    }

    
    function podemosVenderPor(preco) { 
        if (params.compras && params.compras.length > 0) { 
            var volumeQuePodeSerVendidoComLucro = 0;
            for (var i = 0; i < params.compras.length; i++) {
                if (obterValorVendaPara(params.compras[i].valor) < preco) { 
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
            blinktradeWs.sendOrder({
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
                    blinktradeWs.heartbeat(function() { 
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

        return blinktradeWs.requestLedger( { page: pagina, pageSize: profundidadeDaCarteira })
            .then(function(historico) { 
                
                var livro = historico.LedgerListGrp;
                var tamanhoPagina = livro.length;

                for (var i = 0; i < tamanhoPagina; i++) { 
                    var item = livro[i];

                    if (new Date(item.Created) > dataBase) { 

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
                            if (carteiraTemporaria[i].volume > 0) { 
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
                publico.iniciar();
            });
    }
    
    function trataOrdens() { 
        
        pln("----------------------------------------------------------------------------------------------------------------".titulo);
        pln((new Date().toLocaleString() + " - Valor máximo para compra: R$ " + params.valorMaximoCompra + ", Máximo de gastos: R$ " + params.maximoGastos + " - Valor investido: R$ " + obterValorTotalGasto() + ".").titulo);
        pln("");
        
        if (params.aguardandoOrdem) { 
            pln("Aguardando execução da última ordem".aviso);
            pln("");
            return;
        }

        var o = params.book;
        if (!o || !o.asks || !o.bids || !o.bids[0] || !o.asks[0]) { 
            pln("Deu ruim!!".erro);
            pln("");
            return;
        }
    
        var valorVenda = obterValorVenda(),
            valorMedioDaCarteira = obterValorVendaPara(obterValorMedioCompras()),
            melhorOfertaCompraAtual = o.bids[0],
            melhorOfertaVendaAtual = o.asks[0],
            volumeTotal = obterVolumeTotal(),
            saldoBRL = params.saldoBRL,
            saldoBTCBRL = (volumeTotal * melhorOfertaCompraAtual),
            saldoBrutoBRL = (saldoBRL + saldoBTCBRL);

        pln("STATUS ATUAL DA CARTEIRA:");
        pln("    - Saldo atual: R$ " + saldoBRL.toFixed(2));
        pln("    - Saldo BTC em BRL: R$ " + saldoBTCBRL.toFixed(2));
        pln("    - Saldo total atual (Bruto): R$ " + saldoBrutoBRL.toFixed(2));
        pln("    - Saldo total atual (Líquido): R$ " + (saldoBrutoBRL - (saldoBrutoBRL * params.taxaDaCorretora)).toFixed(2));
        pln("    - Valor médio das compras: R$ " + valorMedioDaCarteira.toFixed(3));
        pln("    - Volume total: BTC " + volumeTotal);
        pln("    - Target de venda: R$ " + valorVenda.toFixed(2));
        pln("    - Delta de saída em: " + (((valorVenda - melhorOfertaCompraAtual)/valorVenda)*100).toFixed(2) + "%");
        pln("");
        pln("STATUS ATUAL DO MERCADO:");
        pln("    - Compra: R$ " + melhorOfertaCompraAtual.toFixed(3));
        pln("    - Venda: R$ " + melhorOfertaVendaAtual.toFixed(3));
        pln("");
        
        /// Caso já tenhamos uma ordem executada
        if (params.comprado) { 
            
            pln("Executando comprado...".comprado);
            var volumeQuePodeSerVendido = podemosVenderPor(melhorOfertaCompraAtual);
            if (volumeQuePodeSerVendido > 0) { 

                pln(("Desfazendo de volume com lucro: " + volumeQuePodeSerVendido).comprado);
                adicionarOrdemVenda(melhorOfertaCompraAtual, volumeQuePodeSerVendido, function(r) { 
                    if (r) { 
                        limparCompras(melhorOfertaCompraAtual);
                    }
                }, function() { });

            } 
            else if (melhorOfertaCompraAtual > valorVenda) { 
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
                    else if (!existemComprasNoValor(melhorOfertaVendaAtual)) { 
    
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
  
    var publico = { 
        iniciar : function() { 
            pln("Iniciando...".titulo);

            params = clone(parametrosDefault);

            var dataBase = new Date(params.dataBase);
                       
            /// Conecta na Exchange
            blinktradeWs.connect().then(function() {
                
                return blinktradeWs.login({ username: params.security.user, password: params.security.password });
            
            })
            .then(function() { 
                blinktradeWs.balance().then(function(extrato) { 
                    params.saldoBRL = ((extrato.Available.BTC ? extrato.Available.BRL : extrato[params.idCorretora].BRL) / 1e8);
                });
            })
            .then(function(logged) {
                
                atualizarCarteira(dataBase, function() { 

                    
                    blinktradeWs.executionReport()
                        .on("EXECUTION_REPORT:PARTIAL", execucaoParcial)
                        .on("EXECUTION_REPORT:EXECUTION", execucaoTotal);
                    
                    blinktradeWs.subscribeOrderbook([params.simboloBTC])
                        .on("OB:NEW_ORDER", atualizaBook)
                        .on("OB:UPDATE_ORDER", atualizaBook)
                        .then(function(fullBook) { 
                        
                            enviarBatida();
                            var dadosDoBook = fullBook.MDFullGrp[params.simboloBTC];
                            params.book = { asks:dadosDoBook.asks[0], bids:dadosDoBook.bids[0] };
                            trataOrdens();
                
                        })
                        .catch(function(EE) {
                            console.error("Erro na assinatura do book.".erro, EE);
                        });

                }, function() {
                    console.error("Problema ao obter carteira".erro, e);
                });
            })
            .catch(function(e){ 
                console.error("Problema ao registrar pra execution report".erro, e);
            });
        }
    };

    return publico;
}

new AlgoDinha().iniciar();