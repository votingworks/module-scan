
import request from 'supertest'
import {app} from './server'

test('GET /', (done) =>{
  request(app)
    .get('/')
    .expect(200)
    .then((response) => {
      expect(response.text).toContain('Hello')
      done()
    })
})
