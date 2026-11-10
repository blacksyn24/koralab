# KoraLab

**Le labo réseau en ligne, gratuit et multi-constructeur.**

KoraLab simule des routeurs, des switchs et des PC directement dans le navigateur. On construit sa topologie, on câble, on configure en ligne de commande et on teste, sans installer GNS3 ni chercher d'images système.

Projet créé au Bénin par **Urbain Sedami LANDJIDE**, étudiant en Réseaux & Cybersécurité.

## Ce que fait la version actuelle (étape 1)

- **Éditeur de topologie** : routeurs, switchs et PC, câblage en deux clics, voyants de liens (vert/rouge).
- **Console de style Cisco IOS** : modes `>` `#` `(config)#` `(config-if)#` `(config-line)#`, abréviations (`conf t`, `sh ip int br`), aide `?`, complétion Tab, historique, Ctrl+Z, messages d'erreur réalistes.
- **Simulation réseau** : commutation Ethernet avec table MAC, ARP, routage IPv4 (routes connectées et statiques), ICMP (ping, traceroute), TTL, SVI de gestion des switchs.
- **Commandes** : `hostname`, `interface`, `ip address`, `shutdown`, `description`, `ip route`, `ip default-gateway`, `show ip interface brief`, `show ip route`, `show arp`, `show mac address-table`, `show running-config`, `ping`, `traceroute`, `copy running-config startup-config`…
- **PC** : configuration IP par formulaire ou commande, `ipconfig`, `ping`, `tracert`, `arp -a`.
- **Sauvegarde** automatique dans le navigateur, export et import des labs en JSON.

## Feuille de route

1. ✅ Topologie, IOS de base, routage statique
2. VLAN, trunk, routage inter-VLAN, DHCP, STP
3. TP guidés avec vérification automatique et pannes à dépanner
4. Syntaxe Huawei VRP, puis MikroTik RouterOS
5. OSPF, ACL, NAT, sécurité

## Développement

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # tests du moteur réseau
```

Le moteur réseau (`src/engine`) est du TypeScript pur, sans dépendance, testé avec Vitest.

## Mention légale

KoraLab simule des commandes de style Cisco IOS à des fins pédagogiques. KoraLab n'est affilié à aucun constructeur. Cisco et IOS sont des marques de leurs propriétaires respectifs. Aucune image système ni aucun code propriétaire n'est utilisé.
