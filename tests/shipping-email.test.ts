import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeTrackingUrl,shippingEmail} from '../lib/shipping-email';
test('supplier tracking links reject script and non-HTTPS schemes',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,bad','http://example.test','not a URL'])assert.equal(safeTrackingUrl(url),'');
 assert.equal(safeTrackingUrl('https://example.test/track'),'https://example.test/track');
});
test('shipping emails escape supplier data and omit unsafe links',()=>{
 const html=shippingEmail('<script>','shipped','<img src=x>','"carrier','javascript:alert(1)','');
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href='));
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&quot;carrier'));
});
test('delivery email uses a safe review URL',()=>{
 assert.ok(shippingEmail('123','delivered','','','','https://example.test/').includes('https://example.test/reviews'));
 assert.ok(!shippingEmail('123','delivered','','','','javascript:bad').includes('href='));
});
