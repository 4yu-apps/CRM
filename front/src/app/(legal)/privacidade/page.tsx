import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = {
  title: "Política de Privacidade | 4YUmkt",
  description: "Como o 4YUmkt coleta, usa e protege os dados.",
};

export default function PrivacidadePage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      updatedAt="22 de junho de 2026"
      crossLabel="Ver Termos de Uso"
      crossHref="/termos"
    >
      <p style={{ fontSize: 16, color: "#3B3354" }}>
        No 4YUmkt, a gente leva privacidade a sério. Esta política explica, sem juridiquês desnecessário,
        quais dados a gente coleta, por que coleta e o que você pode fazer a respeito. Ao usar a plataforma,
        você concorda com o que está aqui.
      </p>

      <h2 id="quem">1. Quem somos</h2>
      <p>
        O 4YUmkt é uma plataforma de prospecção para gestores de tráfego. A gente encontra negócios em
        fontes públicas, organiza essas informações e entrega para o profissional de marketing decidir como
        abordar. O contato do nosso encarregado de dados é{" "}
        <a href="mailto:4yumkt@gmail.com">4yumkt@gmail.com</a>.
      </p>

      <h2 id="coleta">2. Quais dados a gente coleta</h2>
      <h3>Dados que você nos dá</h3>
      <ul>
        <li>Cadastro: seu nome, email e senha.</li>
        <li>Configuração: cidade, bairros e ramos que você quer prospectar.</li>
        <li>Comunicação: mensagens que você troca com nosso suporte.</li>
      </ul>
      <h3>Dados de negócios prospectados</h3>
      <p>
        Para montar as fichas de leads, a gente reúne informações disponíveis publicamente, como nome do
        estabelecimento, endereço, telefone comercial, perfil em redes sociais, site e avaliações públicas.
        Não coletamos dados sensíveis nem informações pessoais privadas de terceiros.
      </p>
      <h3>Dados de uso</h3>
      <ul>
        <li>Como você navega na plataforma, quais telas usa e quais ações realiza.</li>
        <li>Dados técnicos do seu dispositivo e navegador, por segurança e desempenho.</li>
      </ul>

      <h2 id="uso">3. Por que a gente usa esses dados</h2>
      <ul>
        <li>Para encontrar e organizar leads relevantes para o seu negócio.</li>
        <li>Para evitar mostrar o mesmo lead duas vezes.</li>
        <li>Para manter sua conta segura e funcionando.</li>
        <li>Para melhorar a plataforma e dar suporte quando você precisa.</li>
        <li>Para cumprir obrigações legais.</li>
      </ul>
      <p>
        O 4YUmkt nunca envia mensagens em seu nome de forma automática. O disparo de qualquer abordagem é
        sempre feito por você, manualmente, do seu próprio número.
      </p>

      <h2 id="compartilha">4. Com quem a gente compartilha</h2>
      <p>A gente não vende seus dados. Compartilhamos apenas com:</p>
      <ul>
        <li>
          Prestadores de serviço que nos ajudam a operar (como hospedagem em nuvem), sempre sob contrato e
          dever de sigilo.
        </li>
        <li>Autoridades, quando exigido por lei ou ordem judicial.</li>
      </ul>

      <h2 id="lgpd">5. Seus direitos (LGPD)</h2>
      <p>De acordo com a Lei Geral de Proteção de Dados, você pode, a qualquer momento:</p>
      <ul>
        <li>Confirmar se a gente trata seus dados e acessar o que temos.</li>
        <li>Corrigir dados incompletos ou desatualizados.</li>
        <li>Pedir a exclusão dos seus dados.</li>
        <li>Revogar o consentimento e cancelar a conta.</li>
        <li>Pedir a portabilidade dos seus dados.</li>
      </ul>
      <p>
        Para exercer qualquer um desses direitos, é só escrever para{" "}
        <a href="mailto:4yumkt@gmail.com">4yumkt@gmail.com</a>. A gente responde o mais rápido possível,
        dentro dos prazos da lei.
      </p>

      <h2 id="seguranca">6. Como a gente protege</h2>
      <p>
        Usamos medidas técnicas e organizacionais para manter seus dados seguros, como criptografia em
        trânsito, controle de acesso e monitoramento. Nenhum sistema é 100% à prova de falhas, mas a gente
        trata segurança como prioridade.
      </p>

      <h2 id="retencao">7. Por quanto tempo guardamos</h2>
      <p>
        Mantemos seus dados enquanto sua conta estiver ativa e pelo tempo necessário para cumprir obrigações
        legais. Se você cancelar, removemos ou anonimizamos seus dados pessoais, salvo o que a lei exigir
        manter.
      </p>

      <h2 id="cookies">8. Cookies</h2>
      <p>
        Usamos cookies essenciais para manter você logado e a plataforma funcionando, e cookies de uso para
        entender como melhorar a experiência. Você pode gerenciar cookies nas configurações do seu
        navegador.
      </p>

      <h2 id="mudancas">9. Mudanças nesta política</h2>
      <p>
        Se a gente atualizar esta política, avisamos pelo site ou por email antes das mudanças valerem. A
        data no topo sempre mostra a versão mais recente.
      </p>

      <h2 id="contato">10. Fale com a gente</h2>
      <p>
        Qualquer dúvida sobre privacidade, escreva para{" "}
        <a href="mailto:4yumkt@gmail.com">4yumkt@gmail.com</a> ou chame no WhatsApp{" "}
        <a href="https://wa.me/5511911001414">(11) 91100-1414</a>.
      </p>
    </LegalPage>
  );
}
