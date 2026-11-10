import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function Confidentialite() {
  return (
    <LegalPage title="Politique de confidentialité" updated="novembre 2026">
      <p>
        KoraLab est un projet étudiant et gratuit. Cette page explique quelles données sont collectées, pourquoi, et comment les supprimer. Nous collectons le strict minimum.
      </p>

      <h2>Sans compte</h2>
      <p>
        Vous pouvez utiliser le labo sans créer de compte. Vos labs sont alors enregistrés <b>uniquement dans votre navigateur</b> (stockage local) : ils ne sont envoyés à aucun
        serveur.
      </p>

      <h2>Avec un compte</h2>
      <ul>
        <li>
          <b>Données d&apos;identification</b> : nom, adresse email et, si vous vous connectez avec Google, votre photo de profil Google.
        </li>
        <li>
          <b>Votre travail</b> : les labs que vous enregistrez en ligne et votre progression dans les TP (scores).
        </li>
        <li>
          <b>Données techniques</b> : dates d&apos;inscription et de dernière connexion.
        </li>
      </ul>
      <p>Ces données servent uniquement à faire fonctionner KoraLab : vous connecter, retrouver vos labs sur n&apos;importe quel appareil et suivre votre progression.</p>

      <h2>Ce que nous ne faisons pas</h2>
      <ul>
        <li>Aucune vente ni cession de vos données.</li>
        <li>Aucune publicité, aucun traceur publicitaire.</li>
        <li>Votre mot de passe n&apos;est jamais visible : il est géré et chiffré par Firebase (Google).</li>
      </ul>

      <h2>Où sont stockées les données ?</h2>
      <p>
        Les comptes et les labs sont hébergés par <b>Google Firebase</b> (serveurs situés en Europe). Le site est hébergé par <b>Vercel</b>. Ces prestataires appliquent leurs
        propres mesures de sécurité.
      </p>

      <h2>Qui y a accès ?</h2>
      <p>
        Vous seul voyez vos labs. Les administrateurs de KoraLab peuvent voir la liste des comptes (nom, email, dates, progression) pour gérer la plateforme, et supprimer un compte
        en cas d&apos;abus.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez à tout moment demander l&apos;accès à vos données, leur correction ou la <b>suppression de votre compte et de vos labs</b>, conformément au Code du numérique de
        la République du Bénin. Il suffit d&apos;écrire via le{" "}
        <a href="https://portfolio-urbain.vercel.app/contact" target="_blank" rel="noopener" className="text-kora-300 underline">
          formulaire de contact
        </a>{" "}
        en précisant l&apos;email de votre compte. Vous pouvez aussi supprimer vos labs vous-même depuis « Mes labs ».
      </p>

      <h2>Durée de conservation</h2>
      <p>Les données sont conservées tant que votre compte existe. Un compte supprimé entraîne la suppression de ses labs et de sa progression.</p>
    </LegalPage>
  );
}
