import type { Metadata } from "next";
import { H2, LegalPage } from "../legal";

export const metadata: Metadata = {
  title: "Política de Privacidade | 4YUmkt CRM",
  description: "Como o 4YUmkt CRM coleta, usa e protege os dados.",
};

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="22 de junho de 2026">
      <p>
        Esta Política explica como o 4YUmkt CRM (o aplicativo, o sistema) trata os dados de quem usa
        a plataforma e os dados de prospecção coletados durante o uso. Ao acessar o sistema você
        concorda com o descrito aqui.
      </p>

      <H2>Quem somos</H2>
      <p>
        O 4YUmkt CRM é uma ferramenta de prospecção de clientes operada pela 4YUmkt. Contato:
        4yumkt@gmail.com.
      </p>

      <H2>Dados que coletamos</H2>
      <p>
        <strong>Dados da sua conta:</strong> ao entrar com e-mail e senha ou com sua Conta do Google,
        coletamos seu e-mail e um identificador de conta para autenticar você e isolar seus dados.
        Quando você entra com o Google, recebemos seu nome, e-mail e foto de perfil públicos.
      </p>
      <p>
        <strong>Dados de prospecção:</strong> o sistema reúne informações públicas de negócios (nome,
        endereço, telefone, site, redes sociais, avaliações públicas) a partir de fontes abertas como
        o Google Maps e o site do próprio negócio, para montar e qualificar sua lista de leads.
      </p>
      <p>
        <strong>Configurações e atividade:</strong> guardamos suas preferências de busca (região,
        nichos, área de atuação) e o histórico de ações dentro do sistema para fazer a ferramenta
        funcionar.
      </p>

      <H2>Uso do Google Calendar</H2>
      <p>
        Se você conectar sua Conta do Google e autorizar o acesso à agenda, o sistema usa esse acesso
        apenas para <strong>criar e remover eventos de reunião que você mesmo agenda</strong> dentro
        do CRM. Não lemos, não analisamos e não compartilhamos o conteúdo da sua agenda. Você pode
        revogar esse acesso a qualquer momento nas configurações da sua Conta do Google.
      </p>

      <H2>Como usamos os dados</H2>
      <p>
        Usamos os dados para autenticar você, montar e qualificar leads, gerar rascunhos de mensagem
        para sua revisão, organizar seu funil e operar os recursos do sistema. O sistema nunca envia
        mensagens sozinho: todo contato depende da sua aprovação.
      </p>

      <H2>Compartilhamento</H2>
      <p>
        Não vendemos seus dados. Compartilhamos dados apenas com provedores de infraestrutura
        necessários para o funcionamento (por exemplo, hospedagem e banco de dados), e quando exigido
        por lei. Seus dados de conta e seus leads são isolados por conta: outros usuários não acessam
        o que é seu.
      </p>

      <H2>Seus direitos (LGPD)</H2>
      <p>
        Você pode solicitar acesso, correção ou exclusão dos seus dados, e revogar consentimentos, a
        qualquer momento pelo e-mail 4yumkt@gmail.com. Negócios prospectados que peçam para não serem
        contatados são marcados como opt-out e deixam de receber abordagem.
      </p>

      <H2>Retenção e segurança</H2>
      <p>
        Mantemos os dados enquanto sua conta estiver ativa ou conforme necessário para operar o
        serviço. Adotamos medidas técnicas razoáveis para proteger os dados contra acesso não
        autorizado.
      </p>

      <H2>Alterações</H2>
      <p>
        Podemos atualizar esta Política. Mudanças relevantes serão sinalizadas dentro do sistema. O
        uso continuado após a atualização significa concordância com a nova versão.
      </p>
    </LegalPage>
  );
}
