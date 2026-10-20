#include <stdint.h>
#include <stdio.h>

typedef struct Pane Pane;

Pane *pane_new(uint16_t cols, uint16_t rows, uint64_t scrollback_bytes);
void pane_free(Pane *pane);
int64_t pane_read_rows(Pane *pane, uint64_t epoch, uint64_t first, uint32_t count, uint32_t *cells,
                       uint64_t cells_len, uint32_t *graphemes, uint64_t graphemes_len, uint64_t *info);

int main(void) {
  Pane *pane = pane_new(80, 24, 0);
  if (!pane) return 2;
  static uint32_t cells[4096];
  static uint32_t graphemes[64];
  uint64_t info[2] = {0, 0};
  int64_t rows = pane_read_rows(pane, 0, 0, 1, cells, 4096, graphemes, 64, info);
  printf("rows=%lld\n", (long long)rows);
  pane_free(pane);
  return 0;
}
