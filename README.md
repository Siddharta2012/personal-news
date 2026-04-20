# Globe Daily

Mini web app "giornale interattivo" con:

- mappa del mondo 3D al centro;
- notizie del giorno localizzate in base alla posizione utente;
- aggiornamento automatico ogni 5 minuti;
- refresh manuale con un click.

## Avvio rapido

Apri `index.html` con un server statico, ad esempio:

```bash
python3 -m http.server 4173
```

Poi visita `http://localhost:4173`.

> Nota: per ottenere notizie localizzate reali, il browser deve poter accedere a geolocalizzazione e alle API esterne (Nominatim + GDELT).
