import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function Conditions() {
  return (
    <LegalPage title="Conditions d'utilisation" updated="novembre 2026">
      <h2>1. Le service</h2>
      <p>
        KoraLab est un simulateur réseau en ligne, gratuit, destiné à l&apos;apprentissage. Il <b>simule</b> le comportement d&apos;équipements réseau : ce n&apos;est pas un
        équipement réel, et certains comportements peuvent différer de la réalité.
      </p>

      <h2>2. Marques</h2>
      <p>
        KoraLab reproduit la syntaxe de commandes de différents constructeurs à des fins pédagogiques. KoraLab n&apos;est affilié à aucun constructeur et n&apos;utilise aucun
        logiciel ni aucune image système propriétaire. Cisco, IOS, Huawei, VRP, MikroTik et RouterOS sont des marques de leurs propriétaires respectifs.
      </p>

      <h2>3. Votre compte</h2>
      <ul>
        <li>Vous êtes responsable de la confidentialité de votre mot de passe.</li>
        <li>Un compte est personnel. Les informations fournies doivent être exactes.</li>
        <li>Un compte utilisé de façon abusive (spam, tentative d&apos;intrusion, surcharge volontaire) peut être bloqué ou supprimé.</li>
      </ul>

      <h2>4. Utilisation acceptable</h2>
      <p>Il est interdit de tenter de contourner la sécurité du service, d&apos;accéder aux données d&apos;autres utilisateurs ou de perturber son fonctionnement.</p>

      <h2>5. Disponibilité</h2>
      <p>
        KoraLab est un projet étudiant fourni « en l&apos;état », sans garantie de disponibilité permanente. Pensez à <b>exporter</b> régulièrement vos labs importants (bouton
        « Exporter »).
      </p>

      <h2>6. Vos contenus</h2>
      <p>Les labs que vous créez vous appartiennent. Les TP publiés sur KoraLab restent la propriété de leurs auteurs.</p>

      <h2>7. Contact</h2>
      <p>
        Pour toute question :{" "}
        <a href="https://portfolio-urbain.vercel.app/contact" target="_blank" rel="noopener" className="text-kora-300 underline">
          formulaire de contact
        </a>
        .
      </p>
    </LegalPage>
  );
}
