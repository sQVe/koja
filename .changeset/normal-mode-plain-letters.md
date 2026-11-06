---
'koja': minor
---

Give each part of the app one plain letter in normal mode: `w` for panes, `t` for tabs, `s` for
spaces, `g` to go to a place, and `z` for the view. Splitting right is now `w v`, a new tab is
`t n`, `t 1` to `t 9` select a tab, `s n` makes a space, `z s` toggles the sidebar, and `z l`
switches the layout. Plain `h/j/k/l` and the arrow keys move between panes, `H/J/K/L` swap them, `:`
opens the palette, `/` leaves normal mode and searches the terminal, and `?` opens help. `ctrl-w`
keys still work. The `ctrl-t` and `ctrl-q` keys are gone, and so is the agent jump: `alt-down`,
`alt-up`, and the Next and Previous agent palette entries. Key hints in the palette and menus now
show the normal-mode key, such as `W V` for splitting right.

The palette's Next space and Previous space now step through spaces in the order the sidebar shows,
the same as `s j` and `s k`.
