# Algodinha

Algoritmo de negociação automatizada para Bitcoin - via Foxbit / Blinktrade.

## Sobre

O robô executa a estratégia de [Scalper](https://www.daytraderpro.com.br/blog/o-que-e-scalping/), visando pequenos lucros no maior número de ordens possíveis.

Execute literalmente por sua conta e risco. 

## Instalando

Baixe o fonte ou clone o Repo e baixe as dependêcias usando:

```javascript
npm install
```

## Configurando

### Segurança
Antes de executar o robô você precisa gerar suas credenciais de acesso [aqui](https://foxbit.exchange/#api). Estes dados devem ser salvos em um arquivo chamado `api.json` na raiz da biblioteca utilizando o seguinte formato:

```javascript
{ 
    "user": "",
    "password": "",
    "secret": ""
}
```

### Parametrização
Você deve também parametrizar a execução considerando os limites e riscos que você está disposto a correr com a ferramenta. Os principais parâmetros que coordenam a proporção risco/lucro são os seguintes:

```
valorMaximoCompra : 70000,
maximoGastos : 2500,
valorOrdem : 100,
lucroEsperado : 0.06,
```

De fato, como regra geral, estes são os únicos parâmetros que você precisaria alterar para realizar a execução.

## Executando

Para executar, basta utilizar o seguinte comando:

```
node algodinha.js
```

