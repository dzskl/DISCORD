const express = require('express');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { isAdmin, DEV_USER, bypassActive } = require('../middleware/auth');
const { getCredential } = require('../db');

const router = express.Router();

passport.serializeUser((u, done) => done(null, u));
passport.deserializeUser((u, done) => done(null, u));

let _registeredKey = null;
function ensureDiscordStrategy() {
  const clientID = getCredential('DISCORD_CLIENT_ID');
  const clientSecret = getCredential('DISCORD_CLIENT_SECRET');
  if (!clientID || !clientSecret) return false;
  const key = `${clientID}::${clientSecret}::${process.env.PUBLIC_URL || ''}`;
  if (_registeredKey === key) return true;
  passport.unuse('discord');
  passport.use(new DiscordStrategy({
    clientID,
    clientSecret,
    callbackURL: (process.env.PUBLIC_URL || 'http://localhost:3000') + '/auth/discord/callback',
    scope: ['identify']
  }, (accessToken, refreshToken, profile, done) => {
    done(null, {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null
    });
  }));
  _registeredKey = key;
  return true;
}

router.get('/discord', (req, res, next) => {
  if (!ensureDiscordStrategy()) return res.redirect('/setup.html?missing=discord');
  passport.authenticate('discord')(req, res, next);
});

router.get('/discord/callback', (req, res, next) => {
  if (!ensureDiscordStrategy()) return res.redirect('/setup.html?missing=discord');
  passport.authenticate('discord', { failureRedirect: '/login.html?login=fail' })(req, res, () => {
    res.redirect(isAdmin(req.user) ? '/app.html' : '/login.html?login=denied');
  });
});

router.post('/logout', (req, res) => {
  req.logout(() => req.session.destroy(() => res.json({ ok: true })));
});

router.get('/me', (req, res) => {
  if (bypassActive()) {
    return res.json({ authenticated: true, user: req.user || DEV_USER, admin: true, dev: true });
  }
  if (!req.user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: req.user, admin: isAdmin(req.user) });
});

module.exports = router;
