import importlib.util,json,unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('services',Path(__file__).with_name('generate-services.py')); module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ServicesTest(unittest.TestCase):
 def test_all_groups_have_pages_and_item_targets(self):
  data=json.loads(module.read('data/services.json'));out=module.outputs()
  self.assertEqual(len(data['services']),12)
  for s in data['services']:
   page=out.get('dist/'+s['slug'],module.read('dist/'+s['slug']))
   self.assertNotIn('Здесь ',page);self.assertNotIn('рыба-текст',page)
   for item in s['items']:
    self.assertIn('id="'+item.get('anchor',item['id'])+'"',page)
    self.assertIn(s['slug']+'#'+item.get('anchor',item['id']),out['dist/uslugi.html'])
 def test_prices_stay_inside_disclosures_and_unknown_staff_is_omitted(self):
  data=json.loads(module.read('data/services.json'));out=module.outputs()
  for service in data['services']:
   if service.get('preservedPage'): continue
   page=out['dist/'+service['slug']]
   self.assertNotIn('id="doctors"',page); self.assertNotIn('id="reviews"',page)
   self.assertNotIn('Посмотреть цены',page);self.assertNotIn('Полный прайс по направлению',page)
   self.assertIn('<dl>',page);self.assertIn('₽',page)
   self.assertNotIn('assets/about-2.jpg',page)
 def test_title_change_propagates_and_is_escaped(self):
  original=module.read;data=json.loads(original('data/services.json'));s=data['services'][0];s['title']='Тест <script>alert(1)</script>'
  with patch.object(module,'read',side_effect=lambda p:json.dumps(data) if p=='data/services.json' else original(p)):
   out=module.outputs()
  for name in ['dist/'+s['slug'],'dist/uslugi.html','dist/index.html','dist/detyam.html']:
   self.assertIn('Тест &lt;script&gt;',out[name]);self.assertNotIn('<script>alert(1)</script>',out[name])
 def test_unrelated_homepage_content_is_preserved(self):
  original=module.read
  with patch.object(module,'read',side_effect=lambda p:original(p).replace('</footer>','<!-- unrelated change --></footer>') if p=='dist/index.html' else original(p)):
   self.assertIn('<!-- unrelated change -->',module.outputs()['dist/index.html'])
 def test_generation_is_idempotent(self):
  for name,content in module.outputs().items(): self.assertEqual(module.read(name),content)
if __name__=='__main__': unittest.main()
