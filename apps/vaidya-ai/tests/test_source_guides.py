import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import closing

from vedai.passages import PassageStore
from vedai.query_planner import retrieve_plan
from unittest.mock import Mock


class SourceGuideTests(unittest.TestCase):
    def test_guides_resolve_only_stored_units_and_honor_filters(self):
        with tempfile.TemporaryDirectory() as folder:
            store = object.__new__(PassageStore)
            store.path = Path(folder) / 'passages.sqlite3'
            source = {'passage_id': 'stored', 'work': 'astangahrdayasamhita', 'kind': 'base-text',
                      'language': 'sa-Latn', 'sections': [{'n': '1'}, {'n': '6'}],
                      'sanskrit': 'full stored unit', 'references': [{'xml_ids': ['Ah.1.6.153a']}]}
            with closing(sqlite3.connect(store.path)) as db, db:
                db.execute('CREATE TABLE passages (payload TEXT)')
                db.execute('INSERT INTO passages VALUES (?)', [json.dumps(source)])
            rows = store.guided('हरीतकी के गुण')
            self.assertEqual(len(rows), 1)
            self.assertEqual(len(rows[0][1]), 1)  # Missing adjacent verses are never invented.
            self.assertEqual(rows[0][1][0]['sanskrit'], source['sanskrit'])
            for filters in [{'work': 'carakasamhita'}, {'kind': 'commentary'}, {'chapter': '7'}, {'language': 'sa-Deva'}]:
                self.assertEqual(store.guided('हरीतकी', filters), [])
            self.assertEqual(store.guided('unrelated question'), [])

    def test_guides_preserve_adjacent_passages_without_crowding_out_search(self):
        class Store:
            def guided(self, question, filters):
                return [({'topic': 'Properties'}, [{'passage_id': f'g{i}', 'sanskrit': 'a stored passage'} for i in range(30)])]
            def packet(self, *args, **kwargs):
                return [{'passage_id': f's{i}', 'sanskrit': 'independent search'} for i in range(30)]
        retriever = Mock()
        retriever.search.return_value = [{'id': 'chunk'}]
        plan = {'status': 'local', 'queries': [{'topic': 'Query', 'query': 'haritaki', 'terms': ['haritaki']}]}
        _, packet = retrieve_plan('haritaki', plan, retriever, Store(), filters={'kind': 'base-text'})
        self.assertEqual(len(packet), 40)
        self.assertEqual(sum(p['passage_id'].startswith('g') for p in packet), 24)
        self.assertEqual(len({p['citation_id'] for p in packet}), 40)
        self.assertTrue(any(p['passage_id'].startswith('s') for p in packet))


if __name__ == '__main__':
    unittest.main()
