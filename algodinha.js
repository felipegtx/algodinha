
/// TODO: 
///     - Detectar queda de conexão (internet fora do ar);
///     - Enviar email para relatar trades e erros;
///     - Rastrear ponto de inversão para entrar comprado;
///     - Obter o valor real gasto;

var AlgoDinha = function() { 
    
    var BlinkTradeWS = require("blinktrade").BlinkTradeWS,
        blinktradeWs = new BlinkTradeWS( { prod: true }),
        colors = require('colors');
    
    colors.setTheme({
        erro: ["red", "underline"],
        aviso: ["yellow", "bold"],
        ok: ["green", "bold"],
        comprado: ["blue"],
        vendido: ["magenta"],
        titulo: ["white", "bold"]
    });

    var params = {

        /// Estado da aplicação
        security : require("./api.json"), 
        compras : [],
        ultimaMelhorOferta : null,
        book : { bids:[], asks:[] },
        taxaDaCorretora : 0.05,
        aguardandoOrdem : false,
        comprado : false,
        subindo : false,
        interromperExecucao : false,

        /// Parâmetros da execução
        valorMaximoCompra : 70000,
        maximoGastos : 2000,
        valorOrdem : 100,
        lucroEsperado : 0.3,
        dataBase : "2017-12-18 20:11:00",
        saldoBRL : 0
        
    };
       
    function pln(str, warn) { 
        if (!warn) { 
            console.info(str);
        } else { 
            console.warn(str.aviso);
        }
    }

    function trataNegociacao(ordem) { 
        blinktradeWs.balance().then(function(extrato) { 
            
            
            if (ordem.Side == "1") { 
                
                var saldoAnterior = obterVolumeTotal();
                var disponivel = ((extrato.Available.BTC ? extrato.Available.BTC : extrato["4"].BTC) / 1e8);
                
                if (saldoAnterior > 0) { 
                    
                    var executado = ordem.LastShares / 1e8;
                    disponivel = (disponivel + executado) - (saldoAnterior + executado);
                    
                }
                
                adicionarCompra((ordem.LastPx / 1e8), disponivel);
            } else { 

                console.log("Vendeu", ordem, novoSaldoBRL, params.saldoBRL);
                
                var novoSaldoBRL = ((extrato.Available.BTC ? extrato.Available.BRL : extrato["4"].BRL) / 1e8);
                if (novoSaldoBRL <= params.saldoBRL) { 
                    
                    console.error("Saldo diminuiu", novoSaldoBRL, params.saldoBRL);
                    params.interromperExecucao = true;

                }
                params.saldoBRL = novoSaldoBRL;

            }
            

            params.aguardandoOrdem = false;
        });
    }
    
    function onPartial(ordem) {
        trataNegociacao(ordem);
    }
    
    function onExecution(ordem) {
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
    
    function obterValorVenda() { 
        var valorMedio = obterValorMedioCompras();
        var baseCalculo = (obterVolumeTotal() * valorMedio) * ((params.taxaDaCorretora * 2) + params.lucroEsperado);
        return valorMedio + baseCalculo;
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
    
    function adicionarCompra(valor, volume) { 
        params.comprado = true;
        params.compras.push({valor:valor, volume:volume});
    }
    
    function adicionarOrdemVenda(preco, volume, okDel, nokDel) { 
        adicionarOrdem(preco, volume, "2", okDel, nokDel);
    }
    
    function adicionarOrdemCompra(preco, volume, okDel, nokDel) { 
        adicionarOrdem(preco, volume, "1", okDel, nokDel);
    }
    
    function limparCompras() { 
        params.compras.length = 0;
    }
    
    function trataOrdens() { 
        
        if (params.interromperExecucao) { 
            pln("Execução interrompida".erro);
            return;
        }

        pln("----------------------------------------------------------------------------------------------------------------".titulo);
        pln((new Date().toLocaleString() + " - Valor máximo para compra: R$ " + params.valorMaximoCompra + ", Máximo de gastos: R$ " + params.maximoGastos + " - Valor investido: R$ " + obterValorTotalGasto() + ".").titulo);
        pln("");
        
        if (params.aguardandoOrdem) { 
            pln("Aguardando execução da última ordem".aviso);
            pln("");
            return;
        }
    
        var o = params.book;
        var valorVenda = obterValorVenda();
        var valorMedioDaCarteira = obterValorMedioCompras();
        var melhorOfertaCompraAtual = o.bids[0];
        var melhorOfertaVendaAtual = o.asks[0];
    
        pln("STATUS ATUAL DA CARTEIRA: ");
        pln("    - Valor médio: R$ " + valorMedioDaCarteira.toFixed(3));
        pln("    - Volume total: " + obterVolumeTotal());
        pln("    - Target: R$ " + valorVenda.toFixed(2));
        pln("");
        pln("STATUS ATUAL DO MERCADO");
        pln("     - Compra: " + melhorOfertaCompraAtual.toFixed(3));
        pln("     - Venda: " + melhorOfertaVendaAtual.toFixed(3));
        pln("     - Aguardando uma melhora de " + (((valorVenda - melhorOfertaCompraAtual)/valorVenda)*100).toFixed(2) + "%");
        pln("");
        
        /// Caso já tenhamos uma ordem executada
        if (params.comprado) { 
            
            pln("Executando comprado...".comprado);
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
                                limparCompras();
                                params.comprado = false;
                                params.subindo = false;
                                console.log("FINALIZADO!!!!!!!!!");
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
    
                if (obterValorTotalGasto() >= params.maximoGastos) { 
    
                    /// Gastamos tudo...
                    pln(" - Gastamos todo o orçamento. Agora tem que rezar.");
    
                } else { 
    
                    
                    /// Vamos tentar diminuir o custo médio comprando mais abaixo do preço de entrada
                    var thresholdNovaCompra = (obterValorMenorCompra() - params.valorOrdem);
                    
                    if (melhorOfertaVendaAtual > valorMedioDaCarteira) { 
                        pln("O mercado está subindo, e ele tem talento pra isso!! Melhor oferta de venda atual: R$ " + melhorOfertaVendaAtual + ".");
                    }
                    else if (melhorOfertaVendaAtual < thresholdNovaCompra) { 
    
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
    
                        pln("  Muito caro. Melhor oferta atual: R$ " + melhorOfertaVendaAtual + ", menor valor comprado: R$ " + obterValorMenorCompra() + ". Comprando novamente em: R$ " + thresholdNovaCompra);
    
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
                symbol: "BTCBRL"
            }).then(
                function(ok){ 
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

    function enviarBatida(ultimaExecucao) { 
        setTimeout(function() { 
            blinktradeWs.heartbeat(function() { 
                console.log(colors.dim(" <3  <3  <3  <3  <3  <3  <3  <3  <3  <3 "));
                enviarBatida();
            })
            .catch(function(E) {
                console.error("Heartbeat falhou".erro, E);
                publico.iniciar();
            });
        }, 10000 /*Every ten seconds*/);
    }

    function atualizarCarteira(dataBase, okDel, nokDel) { 
        return blinktradeWs.requestLedger( { pageSize: 200 })
            .then(function(historico) { 
                
                var carteiraTemporaria = {};
                var livro = historico.LedgerListGrp;

                for (var i = 0; i < livro.length; i++) { 
                    var item = livro[i];

                    if (new Date(item.Created) > dataBase) { 

                        /// T - Trade
                        /// TF - Trade Fee
                        if (!carteiraTemporaria[item.Reference]) { 
                            carteiraTemporaria[item.Reference] = { valor: 0, volume: 0};
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

                    for(i in carteiraTemporaria) { 
                        if (carteiraTemporaria[i].volume > 0) { 
                            adicionarCompra(round(carteiraTemporaria[i].valor, 2), round(carteiraTemporaria[i].volume, 8));
                        }
                    }
                    
                    okDel();
                })
            .catch(function(Exc) {
                console.error("Deu ruim na posição".erro, Exc);
                publico.iniciar();
            });
    }
  
    var publico = { 
        iniciar : function() { 
            pln("Iniciando...".titulo);

            var dataBase = new Date(params.dataBase);
                       
            /// Conecta na Exchange
            blinktradeWs.connect().then(function() {
                
                return blinktradeWs.login({ username: params.security.user, password: params.security.password });
            
            })
            .then(function() { 
                blinktradeWs.balance().then(function(extrato) { 
                    params.saldoBRL = ((extrato.Available.BTC ? extrato.Available.BRL : extrato["4"].BRL) / 1e8);
                });
            })
            .then(function(logged) {
                
                atualizarCarteira(dataBase, function() { 

                    enviarBatida();
                    
                    blinktradeWs.executionReport()
                        .on("EXECUTION_REPORT:PARTIAL", onPartial)
                        .on("EXECUTION_REPORT:EXECUTION", onExecution);
                    
                    blinktradeWs.subscribeOrderbook(["BTCBRL"])
                        .on("OB:NEW_ORDER", atualizaBook)
                        .on("OB:UPDATE_ORDER", atualizaBook)
                        .then(function(fullBook) { 
                
                            var dadosDoBook = fullBook.MDFullGrp.BTCBRL;
                            params.book = { asks:dadosDoBook.asks[0], bids:dadosDoBook.bids[0] };
                            trataOrdens();
                
                        }).catch(function(EE) {
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


/// Adicionar 2 horas de FUSO
new AlgoDinha().iniciar();





