# Assinatura do instalador Windows

## Estado atual

A versão pública 1.0.3 não tem assinatura digital. O ícone do Elo já está aplicado, mas ícone e metadados não substituem uma assinatura. Em 24/09/2026 não foi encontrado certificado de assinatura de código nos repositórios pessoais do usuário ou da máquina, nem configuração de serviço de assinatura neste PC.

O projeto tem um modo de build assinado preparado. Ele ainda depende de um certificado/serviço válido; nenhum certificado local de teste foi criado e nenhuma nova versão foi publicada como assinada.

## Com um certificado confiável instalado no Windows

O certificado precisa ser de **assinatura de código (Code Signing)**, com chave privada disponível, dentro da validade e emitido por uma autoridade confiável para distribuição pública no Windows. Um certificado HTTPS do site ou um certificado autoassinado não substitui isso. O nome de fornecedor vem da identidade validada pelo emissor, não do nome que escrevermos no código.

Se o emissor utiliza token físico/HSM, conecte-o e instale o software oficial correspondente. O script não exporta sua chave e não pede senha pelo chat. Se o dispositivo exigir PIN, insira-o somente na interface oficial do provedor.

No PowerShell, na pasta do projeto:

```powershell
# Thumbprint/Impressão digital é um identificador público do certificado, não a chave privada.
$env:ELO_SIGNING_CERT_SHA1 = 'IMPRESSAO_DIGITAL_DE_40_CARACTERES'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-signed.ps1 -CheckOnly
npm.cmd run build:desktop:signed
```

O primeiro comando apenas confere o certificado. O segundo mantém o ícone, habilita assinatura do executável e do instalador, exige assinatura pelo empacotador, usa SHA-256 com carimbo de tempo e verifica os dois arquivos. O SHA-1 no nome da variável é o identificador do certificado usado pelo Windows, não o algoritmo de assinatura dos arquivos.

A saída fica em `dist/signed`. Se não houver certificado, ele estiver inválido ou a assinatura/carimbo não puder ser verificado, o comando falha. Não trate arquivos de uma tentativa que falhou como uma distribuição assinada. O script não envia nada ao GitHub.

Para conferir um arquivo separadamente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-signature.ps1 -FilePath 'CAMINHO_DO_INSTALADOR.exe'
```

A verificação usa as raízes de confiança deste Windows. Para distribuição pública, o certificado deve ser reconhecido pelo Windows dos usuários, não apenas por uma raiz privada instalada neste PC. A assinatura não comprova ausência de malware nem garante que o SmartScreen deixará de alertar imediatamente.

O fluxo atual do GitHub Actions e `npm run build:desktop` continuam sendo builds sem assinatura. Um runner do GitHub não tem acesso ao certificado/token deste PC. Para assinatura em nuvem, será preciso configurar o provedor aprovado e um fluxo específico; não coloque arquivos de chave, PINs ou senhas no repositório.

## Alternativas sem contratar um certificado agora

- **Microsoft Store, com pacote MSIX:** a experiência atual de cadastro de desenvolvedor é gratuita, exige verificação de identidade e publicação/aprovação na loja. A Microsoft assina a distribuição MSIX da loja. Isso não assina retroativamente o instalador NSIS `.exe` hospedado no GitHub. Precisaremos da identidade do pacote fornecida pelo Partner Center para preparar essa distribuição.
- **SignPath Foundation:** oferece assinatura gratuita para projetos de código aberto elegíveis, mediante análise. Publicar o código no GitHub, sozinho, não torna o projeto elegível. Há requisitos de licença, reputação do projeto e processo de assinatura; não adotamos uma licença nem enviamos uma inscrição em seu nome.

O Microsoft Artifact Signing também existe, mas a elegibilidade para certificados Public Trust varia por país/tipo de desenvolvedor. A documentação consultada só permite desenvolvedores individuais nos EUA e Canadá. Não contrate esse serviço presumindo que uma conta individual no Brasil será elegível.

## Fontes oficiais

- [Microsoft: assinatura e reputação do SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [Microsoft: cadastro de desenvolvedor](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account?tabs=individual)
- [Microsoft: MSIX e assinatura pela Store](https://blogs.windows.com/windowsdeveloper/2026/05/07/publish-to-microsoft-store-as-a-company-now-with-free-registration-and-faster-onboarding/)
- [SignPath Foundation: critérios](https://signpath.org/terms.html)
- [Artifact Signing: elegibilidade](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
