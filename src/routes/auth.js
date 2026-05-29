const express = require('express');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { isAdmin } = require('../middleware/auth');

const router = express.Router();

passport.serializeUser((u, done) => done(null, u));
passport.deserializeUser((u, done) => done(null, u));

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
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
}

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/?login=fail' }),
  (req, res) => res.redirect(isAdmin(req.user) ? '/' : '/?login=denied')
);

router.post('/logout', (req, res) => {
  req.logout(() => req.session.destroy(() => res.json({ ok: true })));
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: req.user, admin: isAdmin(req.user) });
});

module.exports = router;
