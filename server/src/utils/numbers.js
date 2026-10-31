// SQL that turns a row id into the number shown to people: 00004 for small ids, and the whole id when it has more
// than five digits. LPAD alone would cut a long id short, so two rows could end up with the same number (a hosted
// database hands out ids in big blocks).
export const paddedId = "IF(id < 100000, LPAD(id, 5, '0'), CAST(id AS CHAR))";
